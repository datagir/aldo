const express = require('express')
const path = require('path')

const appName = `Aldo`
const appDescription = "Calculez le carbone stocké et ses flux sur votre territoire"
const appRepo = 'https://github.com/datagir/aldo'
const port = process.env.PORT || 8080

const app = express()

app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))

app.use('/static', express.static('static'))
// Hack for importing css from npm package
app.use('/~', express.static(path.join(__dirname, 'node_modules')))
// Populate some variables for all views
app.use(function(req, res, next){
  res.locals.appName = appName
  res.locals.appDescription = appDescription
  res.locals.appRepo = appRepo
  res.locals.page = req.url
  next()
})

const epcis = require('@etalab/decoupage-administratif/data/epci.json')

app.get('/', (req, res) => {
  res.render('landing', { epcis })
})

app.get('/territoire',(req,res)=>{
  const epci = epcis.find(e => e.nom === req.query.epci)
  res.render('territoire', { 
    pageTitle: `${epci.nom}`,
    epci
  })
})

app.get('/ressources', (req, res) => {
  res.render('ressources', {
    pageTitle: 'Ressources'
  })
})

app.get('/formulaire', (req, res) => {
  res.render('form', {
    pageTitle: 'Formulaire'
  })
})

app.get('/contact', (req, res) => {
  res.render('contact', {
    pageTitle: 'Contact'
  })
})

app.get('/accessibilite', (req, res) => {
  res.render('accessibilite', {
    pageTitle: 'Accessibilité'
  })
})

app.get('/components', (req, res) => {
  res.render('components', {
    pageTitle: 'Composants'
  })
})

app.get('/colors', (req, res) => {
  res.render('colors', {
    pageTitle: 'Couleurs'
  })
})

app.get('/typography', (req, res) => {
  res.render('typography', {
    pageTitle: 'Typographie'
  })
})

app.get('/mentions-legales', (req, res) => {
  res.render('legalNotice', {
    pageTitle: "Mentions légales",
    contactEmail: 'mon-produit@beta.gouv.fr',
  })
})

module.exports = app.listen(port, () => {
  console.log(`${appName} listening at http://localhost:${port}`)
})