const {
  getArea: getAreaData,
  getCarbonDensity,
  getBiomassCarbonDensity,
  getForestLitterCarbonDensity
} = require('../../data/stocks')
const { getStocksWoodProducts } = require('./woodProducts')

function getArea (location, key, overrides) {
  if (overrides && (overrides[key] || overrides[key] === 0)) {
    return overrides[key]
  } else {
    return getAreaData(location, key)
  }
}

function getStocksByKeyword (location, keyword, options) {
  const area = getArea(location, keyword, options.areas)
  const groundDensity = getCarbonDensity(location, options.groundKeyword || keyword)
  const groundStock = groundDensity * area
  const biomassDensity = getBiomassCarbonDensity(location, keyword)
  const biomassStock = biomassDensity * area
  const stocks = {
    stock: groundStock + biomassStock,
    area,
    groundStock,
    biomassStock,
    groundDensity,
    biomassDensity,
    totalDensity: groundDensity + biomassDensity
  }
  if (options.getLitter) {
    const forestLitterDensity = getForestLitterCarbonDensity(keyword.replace('forêt ', ''))
    stocks.forestLitterDensity = forestLitterDensity
    stocks.totalDensity += forestLitterDensity
    stocks.forestLitterStock = forestLitterDensity * area
    stocks.stock += stocks.forestLitterStock
  }
  return stocks
}

function getSubStocksByKeyword (location, keyword, parent, options) {
  options = JSON.parse(JSON.stringify(options))
  const stocks = getStocksByKeyword(location, keyword, options)
  stocks.parent = parent
  return stocks
}

function getStocksPrairies (subStocks) {
  const stocks = {
    stock: 0,
    area: 0,
    groundStock: 0,
    biomassStock: 0,
    forestLitterStock: 0
  }
  for (const subType of Object.keys(subStocks)) {
    stocks.stock += subStocks[subType].stock
    stocks.area += subStocks[subType].area
    stocks.groundStock += subStocks[subType].groundStock
    stocks.biomassStock += subStocks[subType].biomassStock
    if (subStocks[subType].forestLitterStock) {
      stocks.forestLitterStock += subStocks[subType].forestLitterStock
    }
  }
  return stocks
}

function getAreasSolsArtificiels (location, options) {
  const impermeableKey = 'sols artificiels imperméabilisés'
  const shrubbyKey = 'sols artificiels arbustifs'
  const treeKey = 'sols artificiels arborés et buissonants'
  if (options.areas[impermeableKey] || options.areas[impermeableKey] === 0) {
    const areas = {}
    areas[impermeableKey] = options.areas[impermeableKey]
    areas[shrubbyKey] = options.areas[shrubbyKey]
    areas[treeKey] = options.areas[treeKey]
    areas.totalArea = areas[impermeableKey] + areas[shrubbyKey] + areas[treeKey]
    return areas
  }
  // there are three different types of arificial ground to consider:
  // * impermeable
  // * with trees
  // * with other greenery (shrubbery, grass etc)

  // start by estimating the area taken by each
  const areaWithoutTrees = getArea(location, 'sols artificiels non-arborés', {})
  const areaWithTrees = getArea(location, 'sols arborés', {})
  const totalArea = areaWithoutTrees + areaWithTrees

  // TODO: ask are there sources to cite for these estimates?
  const estimatedPortionImpermeable = 0.8
  const estimatedPortionGreen = 0.2

  // TODO: ask why proportion of areaWithTrees in both cases is important
  let areaImpermeable = 0
  if (areaWithTrees < 0.2 * totalArea) {
    areaImpermeable = estimatedPortionImpermeable * totalArea
  } else {
    // TODO: ask why subtracting areaWithTrees here
    areaImpermeable = areaWithoutTrees - areaWithTrees
  }

  let areaShrubby = 0
  if (areaWithTrees < 0.2 * (areaImpermeable + areaWithTrees)) {
    areaShrubby = estimatedPortionGreen * (areaWithoutTrees + areaWithTrees) - areaWithTrees
  }

  const areas = { area: totalArea }
  areas[impermeableKey] = areaImpermeable
  areas[shrubbyKey] = areaShrubby
  areas[treeKey] = areaWithTrees
  return areas
}

function getStocksHaies (location, options) {
  // TODO: ask more about this calculation - reusing forest carbon density?
  const carbonDensity = getBiomassCarbonDensity(location, 'forêt mixte')
  const area = getArea(location, 'haies', options.areas)
  const stock = carbonDensity * area
  return {
    stock,
    area,
    biomassDensity: carbonDensity,
    groundDensity: 0,
    biomassStock: stock,
    totalDensity: carbonDensity
  }
}

function asPercentage (value, total) {
  return Math.round(value / total * 1000) / 10
}

// TODO: put in check for if the locations given are valid and findable?
// Or maybe put this error throwing at the lowest level and let them bubble up
function getStocks (location, options) {
  const originalLocation = location
  location = { epci: location.epci.code } // TODO: change the other APIs to use whole EPCI object like stocks wood products?
  options = options || {}
  options.areas = options.areas || {}
  const stocks = {
    cultures: getStocksByKeyword(location, 'cultures', options),
    'zones humides': getStocksByKeyword(location, 'zones humides', options),
    vergers: getStocksByKeyword(location, 'vergers', options),
    vignes: getStocksByKeyword(location, 'vignes', options),
    'produits bois': getStocksWoodProducts(originalLocation, options?.woodCalculation, options),
    haies: getStocksHaies(location, options)
  }

  // extra steps for ground types that are grouped together
  // prairies
  const prairieChildren = ['prairies zones arbustives', 'prairies zones herbacées', 'prairies zones arborées']
  const prairiesSubtypes = {}
  prairieChildren.forEach((c) => {
    prairiesSubtypes[c] = getSubStocksByKeyword(location, c, 'prairies', {
      areas: options.areas,
      groundKeyword: 'prairies'
    })
  })
  Object.assign(stocks, prairiesSubtypes)
  stocks.prairies = getStocksPrairies(prairiesSubtypes)
  stocks.prairies.children = prairieChildren
  // forests
  const forestChildren = ['forêt mixte', 'forêt feuillu', 'forêt conifere', 'forêt peupleraie']
  const forestSubtypes = {}
  forestChildren.forEach((c) => {
    forestSubtypes[c] = getSubStocksByKeyword(location, c, 'forêts', {
      areas: options.areas,
      groundKeyword: 'forêts',
      getLitter: true
    })
  })
  Object.assign(stocks, forestSubtypes)
  stocks.forêts = getStocksPrairies(forestSubtypes)
  stocks.forêts.children = forestChildren
  // sols artificiels
  Object.assign(options.areas, getAreasSolsArtificiels(location, options))
  const solArtChildren = ['sols artificiels imperméabilisés', 'sols artificiels arbustifs', 'sols artificiels arborés et buissonants']
  const solArtSubtypes = {}
  solArtChildren.forEach((c) => {
    solArtSubtypes[c] = getSubStocksByKeyword(location, c, 'sols artificiels', {
      areas: options.areas,
      groundKeyword: c.endsWith('arbustifs') ? 'sols artificiels enherbés' : undefined
    })
  })
  Object.assign(stocks, solArtSubtypes)
  stocks['sols artificiels'] = getStocksPrairies(solArtSubtypes)
  stocks['sols artificiels'].children = solArtChildren

  // extra data prep for display - TODO: consider whether this is better handled by the handler
  // -- percentages by level 1 ground type
  const parentTypes = Object.keys(stocks).filter((s) => !stocks[s].parent)
  const stocksTotal = parentTypes.reduce((a, b) => a + stocks[b].stock, 0)
  const groundAndLitterStocksTotal = parentTypes.reduce((a, b) => {
    return a + (stocks[b].groundStock || 0) + (stocks[b].forestLitterStock || 0)
  }, 0)
  const biomassStocksTotal = parentTypes.reduce((a, b) => a + (stocks[b].biomassStock || 0), 0)
  for (const key of parentTypes) {
    stocks[key].stockPercentage = asPercentage(stocks[key].stock, stocksTotal)
    const groundAndLitter = stocks[key].groundStock + (stocks[key].forestLitterStock || 0)
    stocks[key].groundAndLitterStockPercentage = asPercentage(groundAndLitter, groundAndLitterStocksTotal)
    stocks[key].biomassStockPercentage = asPercentage(stocks[key].biomassStock, biomassStocksTotal)
  }
  // -- percentage stock by reservoir
  const groundStock = parentTypes.reduce((acc, cur) => acc + (stocks[cur].groundStock || 0), 0)
  const biomassStock = parentTypes.reduce((acc, cur) => acc + (stocks[cur].biomassStock || 0), 0)
  const forestLitterStock = parentTypes.reduce((acc, cur) => acc + (stocks[cur].forestLitterStock || 0), 0)
  stocks.percentageByReservoir = {
    'Sol (30 cm)': asPercentage(groundStock, stocksTotal),
    'Biomasse sur pied': asPercentage(biomassStock, stocksTotal),
    Litière: asPercentage(forestLitterStock, stocksTotal),
    'Matériaux bois': asPercentage(stocks['produits bois'].stock, stocksTotal)
  }
  // -- density per level 2 ground type
  stocks.byDensity = {}
  Object.keys(stocks).forEach(key => {
    if (key !== 'produits bois' && stocks[key].hasOwnProperty('totalDensity')) {
      stocks.byDensity[key] = stocks[key].totalDensity || 0
    } else if (stocks[key].densities) {
      Object.assign(stocks.byDensity, stocks[key].densities)
    }
  })

  return stocks
}

module.exports = {
  getStocks
}
