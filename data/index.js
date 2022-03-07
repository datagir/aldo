const csv = require('csvtojson')

// Gets the carbon area density of a given ground type.
async function getCarbonDensity(location, groundType) {
  const csvFilePath = './data/dataByEpci/ground.csv'
  const dataByEpci = await csv().fromFile(csvFilePath)
  const data = dataByEpci.find(data => data.siren === location.epci)
  return parseFloat(data[groundType]) || 0
}

// Gets the area in hectares (ha) of a given ground type in a location.
// The ground types Corine Land Cover uses are different from the types used by Aldo,
// so a mapping is used and the sum of ha of all matching CLC types is returned.
// NB: in the lookup the type names for ground data and the more specific biomass data
// are placed on the same level, so some CLC codes are used in two types.
async function getArea(location, groundType) {
  if (groundType === "haies") {
    return await getAreaHaies(location)
  }
  // consider making this a separate json file for isolation
  // TODO: make more standardised keys?
  const aldoTypeToClcCodes = {
    "cultures": ["211", "212", "213", "241", "242", "243", "244"],
    "prairies": ["231", "321", "322", "323"],
    "prairies zones herbacées": ["231", "321"],
    "prairies zones arbustives": ["322"],
    "prairies zones arborées": ["323"],
    "forêts": ["311", "312", "313", "324"],
    "forêts feuillus": ["311", "324"],
    "forêts conifères": ["312"],
    "forêts mixte": ["313"],
    "vignes": ["221"],
    "vergers": ["222", "223"],
    "sols arborés": ["141"], // aka "sols artificiels arborés et buissonants" in stocks_c tab
    "sols artificiels non-arborés": ["111", "112", "121", "122", "123", "124", "131", "132", "133", "142"],
    "sols artificiels imperméabilisés": ["111", "121", "122", "123", "124", "131", "132", "133", "142"],
    "sols artificialisés": ["112"],
    // TODO: ask about logic F39: area sols arbustifs stocks_c tab.
    "zones humides": ["411", "412", "421", "422", "423", "511", "512", "521", "522", "523"]
  }
  const clcCodes = aldoTypeToClcCodes[groundType]
  if (!clcCodes) {
    throw new Error(`No CLC code mapping found for ground type '${groundType}'`)
  }
  const csvFilePath = './data/dataByEpci/clc18.csv'
  const areasByClcType = await csv().fromFile(csvFilePath)
  const areaForSiren = areasByClcType.find(data => data.siren === location.epci)
  let totalArea = 0
  for (const clcCode of clcCodes) {
    const area = areaForSiren[clcCode]
    // TODO: output warnings for codes that aren't in data at all? As opposed to empty value
    if (area) {
      totalArea += parseFloat(area)
    }
  }
  return totalArea
}

async function getAreaHaies(location) {
  const csvFilePath = './data/dataByEpci/surface-haies.csv'
  const dataByEpci = await csv().fromFile(csvFilePath)
  const data = dataByEpci.filter(data => data.siren === location.epci)
  if(data.length > 1) {
    console.log("WARNING: more than one haies surface area for siren: ", location.epci)
  }
  return parseFloat(data[0].area)
}

async function getBiomassCarbonDensity(location, groundType) {
  if (groundType.startsWith("forêt")) {
    return await getForestBiomassCarbonDensity(location, groundType.split(" ")[1])
  }
  const csvFilePath = './data/dataByEpci/biomass-hors-forets.csv'
  const dataByEpci = await csv().fromFile(csvFilePath)
  const data = dataByEpci.find(data => data.siren === location.epci)
  // NB: all stocks are integers, but flux has decimals
  return parseInt(data[groundType], 10) || 0
}

async function getForestBiomassCarbonDensity(location, forestType) {
  const csvFilePath = './data/dataByEpci/biomass-forets.csv'
  const dataByEpci = await csv().fromFile(csvFilePath)
  const data = dataByEpci.find(data => data.siren === location.epci && data.type.toLowerCase() === forestType)
  if (!data) {
    throw new Error(`No biomass data found for forest type '${forestType}' and epci '${location.epci}'`)
  }
  return parseFloat(data.stock)
}

async function epciList() {
  const csvFilePath = './data/dataByEpci/epci.csv'
  return await csv().fromFile(csvFilePath)
}

module.exports = {
  getCarbonDensity,
  getArea,
  getBiomassCarbonDensity,
  epciList,
  getForestBiomassCarbonDensity,
}