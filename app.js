//Initialize Express
var express = require('express');
var app = express();
var server = require('http').createServer(app);

//Initialize Socket.io
var io = require('socket.io')(server);

//Other middleware needed to configure passport
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var expressSession = require('express-session');

//Passport module
var passport = require('passport');
var passportLocal = require('passport-local')

//AWS packages use with DynamoDB
var AWS = require('aws-sdk');
var s3 = new AWS.S3();
var DOC = require('dynamodb-doc');
AWS.config.update({region: 'us-west-2'});
var docClient = new DOC.DynamoDB();
var dynamodb = new AWS.DynamoDB();

//Set the view engine
app.set('view engine', 'ejs');

//Use the other middleware
app.use(bodyParser.urlencoded({extended: false }));
app.use(cookieParser());
app.use(expressSession({ secret: 'secret', 
		resave: false,
		saveUninitialized:false
	}));

//Register passport middleware
// app.use(passport.initialize());
// app.use(passport.session);

/**********************************ROUTES**********************************/
//Get the homepage
app.get('/', function(req, res){
	res.render('index');
})

//Get the login page
app.get('/login', function(req, res){
	res.render('login');
})

//Get the classes page
app.get('/classes', function(req, res){
	res.render('classes');
})

/*********************************SOCKET IO*************************************/
io.on('connection', function(client){
	console.log('connected...')
})

//Define passport authentication strategy here

//Use bower components(JQuery)
app.use(express.static(__dirname + 'bower_components'));

//Initialize the server
console.log('server listening on port 5400');
server.listen(5400);

//Export this as a package to be used
module.exports = app;