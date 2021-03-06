const {
  getArea: getAreaData,
  getCarbonDensity,
  getBiomassCarbonDensity,
  getForestLitterCarbonDensity
} = require('../../data/stocks')
const { getStocksWoodProducts } = require('./woodProducts')
const { GroundTypes } = require('../constants')

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
    totalReservoirStock: groundStock + biomassStock,
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
    stocks.totalReservoirStock += stocks.forestLitterStock
  }
  stocks.totalStock = stocks.totalReservoirStock
  if (options.agroforestryStock?.[keyword]) {
    // one or the other might not be defined, default to 0 in that case
    stocks.agroforestryDensity = options.agroforestryStock[keyword].density || 0
    stocks.agroforestryArea = options.agroforestryStock[keyword].area || 0
    stocks.agroforestryStock = stocks.agroforestryArea * stocks.agroforestryDensity
    stocks.totalStock += stocks.agroforestryStock
  }
  return stocks
}

function getSubStocksByKeyword (location, keyword, parent, options) {
  options = JSON.parse(JSON.stringify(options))
  const stocks = getStocksByKeyword(location, keyword, options)
  stocks.parent = parent
  return stocks
}

function getStocksForParent (subStocks) {
  const stocks = {
    totalReservoirStock: 0,
    area: 0,
    groundStock: 0,
    biomassStock: 0,
    forestLitterStock: 0,
    agroforestryStock: 0
  }
  for (const subType of Object.keys(subStocks)) {
    stocks.totalReservoirStock += subStocks[subType].totalReservoirStock
    stocks.area += subStocks[subType].area
    stocks.groundStock += subStocks[subType].groundStock
    stocks.biomassStock += subStocks[subType].biomassStock
    if (subStocks[subType].forestLitterStock) {
      stocks.forestLitterStock += subStocks[subType].forestLitterStock
    }
    // NB: this is the most simple solution whilst prairies zones herbacées and cultures are the only
    // instances of agroforestryStock. This would not work if two or more children had agroforestry data
    if (subStocks[subType].agroforestryStock) {
      stocks.agroforestryStock = subStocks[subType].agroforestryStock
      stocks.agroforestryArea = subStocks[subType].agroforestryArea
      stocks.agroforestryDensity = subStocks[subType].agroforestryDensity
    }
  }
  stocks.totalStock = stocks.totalReservoirStock + stocks.agroforestryStock
  return stocks
}

function getAreasSolsArtificiels (location, options) {
  // there are three different types of arificial ground to consider:
  // * impermeable
  // * with trees
  // * with other greenery (shrubbery, grass etc)
  const impermeableKey = 'sols artificiels imperméabilisés'
  const shrubbyKey = 'sols artificiels arbustifs'
  const treeKey = 'sols artificiels arborés et buissonants'

  // start by estimating the area taken by each
  const areaWithoutTrees = getArea(location, 'sols artificiels non-arborés', {})
  let areaWithTrees = options.areas[treeKey]
  if (isNaN(areaWithTrees)) {
    areaWithTrees = getArea(location, 'sols arborés', {})
  }
  const totalArea = areaWithoutTrees + areaWithTrees

  // TODO: ask are there sources to cite for these estimates?
  const estimatedPortionImpermeable = options.proportionSolsImpermeables || 0.8
  const estimatedPortionGreen = 1 - estimatedPortionImpermeable

  let areaImpermeable = options.areas[impermeableKey]
  if (isNaN(areaImpermeable)) {
    // TODO: ask why proportion of areaWithTrees in both cases is important
    if (areaWithTrees < 0.2 * totalArea) {
      areaImpermeable = estimatedPortionImpermeable * totalArea
    } else {
      // TODO: ask why subtracting areaWithTrees here
      areaImpermeable = areaWithoutTrees - areaWithTrees
    }
  }

  let areaShrubby = options.areas[shrubbyKey]
  if (isNaN(areaShrubby)) {
    if (areaWithTrees < 0.2 * (areaImpermeable + areaWithTrees)) {
      areaShrubby = estimatedPortionGreen * (areaWithoutTrees + areaWithTrees) - areaWithTrees
    } else {
      areaShrubby = 0
    }
  }

  const areas = { area: areaImpermeable + areaShrubby + areaWithTrees }
  areas[impermeableKey] = areaImpermeable
  areas[shrubbyKey] = areaShrubby
  areas[treeKey] = areaWithTrees
  return areas
}

function getStocksHaies (location, options) {
  // TODO: ask more about this calculation - reusing forest carbon density?
  const carbonDensity = getBiomassCarbonDensity(location, 'forêt mixte')
  const area = getArea(location, 'haies', options.areas)
  const totalReservoirStock = carbonDensity * area
  return {
    totalReservoirStock,
    totalStock: totalReservoirStock,
    area,
    biomassDensity: carbonDensity,
    groundDensity: 0,
    biomassStock: totalReservoirStock,
    totalDensity: carbonDensity
  }
}

function asPercentage (value, total) {
  return Math.round(value / total * 1000) / 10
}

// TODO: put in check for if the locations given are valid and findable?
// Or maybe put this error throwing at the lowest level and let them bubble up
/*
Data format:
stocks: {
  <groundTypeKey>: {
    area: in ha, user-entered area or our data
    originalArea: in ha, area in our data
    areaModified: area or area of child was overridden by user
    hasModifications: areaModified || other modifications through options
    groundDensity: in tC/ha
    groundStock: in tC
    biomassDensity: in tC/ha
    biomassStock: in tC
    forestLitterDensity: in tC/ha
    forestLitterStock: in tC
    totalDensity: total density across ground, biomass, forest litter reservoirs
    totalReservoirStock: total stocks for ground type for ground, biomass, forest litter reservoirs
    agroforestryDensity: optional, tC/ha
    agroforestryArea: optional, ha
    agroforestryStock: optional, tC
    totalStock: total stocks for territory
    stockPercentage: 0-100 (totalStock / stocks.total * 100)
    children: [<keyword>] optional
    parent: <keyword> optional
  },
  total: total stock for territory,
  percentageByReservoir: reformat data for graph
  byDensity: reformat data for graph
}

options: {
  areas: {
    <groundTypeKey>: in ha
  },
  woodCalculation: 'recolte' or 'consommation',
  proportionSolsImpermeables: 0 - 1
}
*/
function getStocks (location, options) {
  const originalLocation = location
  location = { epci: location.epci.code } // TODO: change the other APIs to use whole EPCI object like stocks wood products?
  options = options || {}
  options.areas = options.areas || {}

  const originalAreas = {}
  Object.keys(options.areas).forEach(key => {
    if (!isNaN(options.areas[key])) {
      if (key.startsWith('sols artificiels')) {
        const optionsWithoutAreas = JSON.parse(JSON.stringify(options))
        optionsWithoutAreas.areas = {}
        Object.assign(originalAreas, getAreasSolsArtificiels(location, optionsWithoutAreas))
      } else {
        originalAreas[key] = getAreaData(location, key)
      }
    }
  })
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
  const prairieChildren = GroundTypes.find(gt => gt.stocksId === 'prairies').children
  const prairiesSubtypes = {}
  prairieChildren.forEach((c) => {
    prairiesSubtypes[c] = getSubStocksByKeyword(location, c, 'prairies', {
      areas: options.areas,
      groundKeyword: 'prairies',
      agroforestryStock: options.agroforestryStock
    })
  })
  Object.assign(stocks, prairiesSubtypes)
  stocks.prairies = getStocksForParent(prairiesSubtypes)
  stocks.prairies.children = prairieChildren
  // forests
  const forestChildren = GroundTypes.find(gt => gt.stocksId === 'forêts').children
  const forestSubtypes = {}
  forestChildren.forEach((c) => {
    forestSubtypes[c] = getSubStocksByKeyword(location, c, 'forêts', {
      areas: options.areas,
      groundKeyword: 'forêts',
      getLitter: true
    })
  })
  Object.assign(stocks, forestSubtypes)
  stocks.forêts = getStocksForParent(forestSubtypes)
  stocks.forêts.children = forestChildren
  // sols artificiels
  // this is an overload of the use of options.areas but since all sols artificiels areas need to
  // be calculated at once, this is a concise way of doing it and since it is the last time the
  // object is used it works.
  Object.assign(options.areas, getAreasSolsArtificiels(location, options))
  const solArtChildren = GroundTypes.find(gt => gt.stocksId === 'sols artificiels').children
  const solArtSubtypes = {}
  solArtChildren.forEach((c) => {
    solArtSubtypes[c] = getSubStocksByKeyword(location, c, 'sols artificiels', {
      areas: options.areas,
      groundKeyword: c.endsWith('arbustifs') ? 'sols artificiels enherbés' : undefined
    })
  })
  Object.assign(stocks, solArtSubtypes)
  stocks['sols artificiels'] = getStocksForParent(solArtSubtypes)
  stocks['sols artificiels'].children = solArtChildren

  // extra data prep for display - TODO: consider whether this is better handled by the handler
  // -- percentages by level 1 ground type
  const parentTypes = Object.keys(stocks).filter((s) => !stocks[s].parent)
  const stocksTotal = parentTypes.reduce((a, b) => a + stocks[b].totalStock, 0)
  const groundAndLitterStocksTotal = parentTypes.reduce((a, b) => {
    return a + (stocks[b].groundStock || 0) + (stocks[b].forestLitterStock || 0)
  }, 0)
  const biomassStocksTotal = parentTypes.reduce((a, b) => a + (stocks[b].biomassStock || 0), 0)
  for (const key of parentTypes) {
    stocks[key].stockPercentage = asPercentage(stocks[key].totalStock, stocksTotal)
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
    'Matériaux bois': asPercentage(stocks['produits bois'].totalStock, stocksTotal)
  }
  // -- density per level 2 ground type
  stocks.byDensity = {}
  const groundTypes = GroundTypes.map(gt => gt.stocksId)
  const modifiedAreas = Object.keys(originalAreas)
  Object.keys(stocks).forEach(key => {
    if (key !== 'produits bois' && stocks[key].hasOwnProperty('totalDensity')) {
      stocks.byDensity[key] = stocks[key].totalDensity || 0
    } else if (stocks[key].densities) {
      Object.assign(stocks.byDensity, stocks[key].densities)
    }
    if (groundTypes.indexOf(key) !== -1) {
      if (isNaN(originalAreas[key])) {
        stocks[key].originalArea = stocks[key].area
        const children = GroundTypes.find(gt => gt.stocksId === key).children
        const hasModifiedChild = children?.some(child => modifiedAreas.includes(child))
        stocks[key].areaModified = hasModifiedChild
        stocks[key].hasModifications = hasModifiedChild
      } else {
        stocks[key].originalArea = originalAreas[key]
        stocks[key].areaModified = true
        stocks[key].hasModifications = true
      }
    }
  })
  Object.keys(options.agroforestryStock || []).forEach(key => {
    const hasModifications = options.agroforestryStock[key].density && options.agroforestryStock[key].area
    if (hasModifications) {
      stocks[key].hasModifications = true
      if (stocks[key].parent) {
        stocks[stocks[key].parent].hasModifications = true
      }
    }
  })
  stocks.total = stocksTotal
  return stocks
}

module.exports = {
  getStocks
}
