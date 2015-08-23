// idk what this does
var path = require('path')

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
app.use(passport.initialize());
app.use(passport.session());

/****************************PASSPORT AUTHENTICATION STRATEGY**************************/

//Define passport authentication strategy here
passport.use(new passportLocal.Strategy(function(username, password, done){
	var queryParams = {};
	queryParams.TableName = 'lecto-teachers';
	queryParams.KeyConditions = [docClient.Condition('username', 'EQ', username)];
	queryParams.QueryFilter = docClient.Condition('password', 'EQ', password);
	docClient.query(queryParams, function(err, result){
		if(err){
			done(new Error('Oh Shit!'));
			console.log(err, err.stack)
		} else {
			jsonString = JSON.parse(JSON.stringify(result))
			if(jsonString["Count"] == 0){
				done(null, null)
			} else {
				done(null, {id: username, name: jsonString["Items"].username});
			}
		}
	})
})); 

passport.serializeUser(function(user, done){
	done(null, user.id)
})

passport.deserializeUser(function(id, done){
	//Query the database or cache here
	done(null, {id: id, name: id})
})


/**********************************ROUTES**********************************/
//Get the homepage
app.get('/', function(req, res){
	res.render('index');
});

//Get the login page
app.get('/login', function(req, res){
	res.render('login');
});

//Get the classes page
app.get('/classes', function(req, res){
	res.render('classes');
});

//get the registration page
app.get('/register', function(req, res){
	res.render('register')
});

//Get the dashboard
app.get('/dashboard', function(req, res){
	res.render('dashboard', {
		isAuthenticated: req.isAuthenticated(),
		username: req.user.name
	})
})

//post registration information
app.post('/register', function(req, res){
	username = req.body.name;
	password = req.body.pass;

	register(username, password)
	res.redirect('/')
});

//Post login information
app.post('/login', passport.authenticate('local'), function(req, res){
	res.redirect('/dashboard')
});

app.get('/logout', function(req, res){
	req.logout();
	res.redirect('/')
});


/*********************************SOCKET IO*************************************/
io.on('connection', function(client){
	console.log('connected...')
})

/*********************************FUNCTIONS**************************************/
function register(username, password){
	var params = {};
	params.TableName = 'lecto-teachers';

	//Add more parameters later (comments, reviews)
	params.Item = {username: username, password: password};
	docClient.putItem(params, function(err, data){
		if(err){
			console.log(err, err.stack)
		} else {
			console.log("Account successfully created!");
		}
	})
}

//Load external assets for front-end
app.use(express.static(__dirname + '/public'));

//Use bower components(JQuery)
app.use(express.static(__dirname + 'bower_components'));

//Initialize the server
console.log('server listening on port 5400');
server.listen(5400);

//Export this as a package to be used
module.exports = app;