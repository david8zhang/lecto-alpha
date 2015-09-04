// idk what this does
var path = require('path')

//Initialize Express
var express = require('express');
var flash = require('connect-flash');
var app = express();
// var ExpressPeerServer = require('peer').ExpressPeerServer;
var server = require('http').createServer(app).listen(5400);
console.log("server listening on 5400")

//Initialize Socket.io
var io = require('socket.io')(server)

//Other middleware needed to configure passport
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var expressSession = require('express-session');

//Passport module
var passport = require('passport');
var passportLocal = require('passport-local')

//Email authentication for signup
var nodemailer = require('nodemailer');
var smtpTransport = require('nodemailer-smtp-transport');

//AWS packages use with DynamoDB
var AWS = require('aws-sdk');
var s3 = new AWS.S3();
var DOC = require('dynamodb-doc');

//AWS configuration
AWS.config.update({region: 'us-west-2'});
var AWS_ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID;
var AWS_SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY;
var docClient = new DOC.DynamoDB();
var dynamodb = new AWS.DynamoDB();
var options = {
	debug: true
}

//Used for generating token during password reset
var crypto = require('crypto');

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
app.use(flash());

/****************************PASSPORT AUTHENTICATION STRATEGY**************************/
//Define passport authentication strategy here
passport.use(new passportLocal.Strategy(function(username, password, done){
	AWS.config.update({accessKeyId: AWS_ACCESS_KEY, secretAccessKey: AWS_SECRET_KEY});
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
			console.log(jsonString);
			if(jsonString["Count"] == 0){
				done(null, false, {message: 'Incorrect username or password'})
			} else {
				console.log(jsonString["Items"][0].token)
				//Check if the user has activated through their email
				if(jsonString["Items"][0].token == "null"){
					done(null, false, {message: 'Account not activated. Please check your email'})
				} else {
					//Checks if there is an authentication token (to indicate that the user has authenticated)
					done(null, {id: username, name: jsonString["Items"].username});
				}
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
	res.render('login', {message: req.flash('error')});
});

//Get the logout page
app.get('/logout', function(req, res){
	req.logout();
	res.redirect('/')
});

//Get the classes page
app.get('/classes', function(req, res){
	listSessions(function(sessions){
		var list = []; 
		jsonString = JSON.parse(JSON.stringify(sessions))
		for(i = 0; i < jsonString["Items"].length; i++){
			list.push(jsonString["Items"][i].title + " " + jsonString["Items"][i].name)
		}
		console.log(list);
		res.render('classes', {
			classList: list
		});
	})
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

//Get the new session page
app.get('/session', function(req, res){
	res.render('session',{
		username: req.user.name
	});
})

app.get('/student', function(req, res){
	var sessID = req.query.sid;
	var username = sessID.substring(sessID.indexOf(" ") + 1);
	checkSessionExists(username, function(result){
		console.log("result is: " + result);
		if(result == "found"){
			getSession(username, function(result){
				res.render('student', {
					room: sessID,
					subject: result[1],
					price: result[2],
					title: result[3]
				})
			})
		} else {
			res.redirect('/classes')
		}
	})
	console.log(username);
});

//Get the sessions
app.get('/classroom', function(req, res){
	getSession(req.user.name, function(result){
		res.render('classroom', {
			sessionid: result[0],
			subject: result[1],
			price: result[2],
			title: result[3]
		})
	})
})

//User authentication screen
app.get('/activate/:token', function(req, res){
	authToken = req.params.token.split('&')[0].toString();
	username = req.params.token.split('&')[1].toString();
	activate(username, authToken);
	res.redirect('/login');
})

//post registration information
app.post('/register', function(req, res){
	username = req.body.name;
	password = req.body.pass;
	email = req.body.email;

	generateAuthToken(function(err, token){
		//Create an smtp transport
		var transporter = nodemailer.createTransport(smtpTransport({
			service: 'gmail',
			auth: {
				user: 'lecto.info@gmail.com',
				pass: 'da51d2eda2'
			}
		}));

		//Send out the mail for account activation
		var mailOptions = {
			from: 'lecto.info@gmail.com',
			to: email,
			subject: 'Activate your account',
			text: 'Please click on the link below to activate your account: \n\n' + 
			'http://' + req.headers.host + '/activate/' + token + '&' + username + '\n\n' + 
			'If you did not create an account, please ignore this email' 
		};

		transporter.sendMail(mailOptions, function(error, info){
			if(error){
				console.log(error)
			} else {
					//Registering user
				register(username, password, email)
			}
		})
	})

	res.redirect('/')
});

app.post('/student', function(req, res){
	var sid = encodeURIComponent(req.body.sessionID);
	res.redirect('/student?sid=' + sid);
})

//Post login information - redirect accordingly and show the respective messages 
app.post('/login', passport.authenticate('local', {successRedirect:'/dashboard', failureRedirect:'/login', failureFlash: true}));

app.post('/dashboard', function(req, res){
	deleteSession(req.body.username)
	res.redirect('/dashboard')
})

//Post the new session information
app.post('/newsession', function(req, res){
	var name = req.user.name;
	var subject = req.body.subject;
	var price = req.body.price;
	var title = req.body.name;
	newSession(name, title, subject, price);
	
	//Delay them so that they can't just spam sessions
	var millisecondsToWait = 5000;
	setTimeout(function(){
		res.redirect('/classroom')
	}, millisecondsToWait)
});


/*********************************SOCKET IO*************************************/


/*********************************FUNCTIONS**************************************/
//Creates the user account
function register(username, password, email){
	AWS.config.update({accessKeyId: AWS_ACCESS_KEY, secretAccessKey: AWS_SECRET_KEY});
	var params = {};
	params.TableName = 'lecto-teachers';

	//Add more parameters later (comments, reviews)
	params.Item = {username: username, password: password, email: email, token: "null"};
	docClient.putItem(params, function(err, data){
		if(err){
			console.log(err, err.stack)
		} else {
			console.log("Account successfully created!");
		}
	})
}

//Store the session in a database
function newSession(name, title, subject, price){
	AWS.config.update({accessKeyId: AWS_ACCESS_KEY, secretAccessKey: AWS_SECRET_KEY});
	var params = {};
	params.TableName = 'teacher-sessions';
	params.Item = {name: name, title: title, subject: subject, price: price};
	docClient.putItem(params, function(err, data){
		if(err){
			console.log(err, err.stack)
		} else {
			console.log("Session successfully created!");
		}
	})

}

//Retrieves session information
function getSession(username, callback){
	AWS.config.update({accessKeyId: AWS_ACCESS_KEY, secretAccessKey: AWS_SECRET_KEY});
	var params = {};
	params.TableName = 'teacher-sessions';
	params.Key = {name: username}
	docClient.getItem(params, function(err, result){
		if(err){
			console.log(err, err.stack)
		} else {
			jsonString = JSON.parse(JSON.stringify(result))
			console.log(jsonString)
			var sessionid = jsonString["Item"].title + " " + jsonString["Item"].name;
			callback([sessionid, jsonString["Item"].subject, jsonString["Item"].price, jsonString["Item"].title]);
		}
	})
}

//list sessions so that users can see them on the 'classes' page
function listSessions(callback){
	AWS.config.update({accessKeyId: AWS_ACCESS_KEY, secretAccessKey: AWS_SECRET_KEY});
	var params = {TableName: 'teacher-sessions'}
	docClient.scan(params, function(err, data){
		if(err){
			console.log(err, err.stack)
		} else {
			console.log(data);
			callback(data);
		}
	})
}

//delete a specific class session
function deleteSession(username){
	AWS.config.update({accessKeyId: AWS_ACCESS_KEY, secretAccessKey: AWS_SECRET_KEY});
	var params = {};
	params.TableName = 'teacher-sessions';
	params.Key = {name: username}
	docClient.deleteItem(params, function(err, result){
		if(err){
			console.log(err, err.stack)
		} else {
			console.log("Session deleted!");
			console.log(result);
		}
	})
}


//Check if a specific class session exists
function checkSessionExists(username, callback){
	AWS.config.update({accessKeyId: AWS_ACCESS_KEY, secretAccessKey: AWS_SECRET_KEY});
	var params = {};
	params.TableName = "teacher-sessions";
	params.KeyConditions = [docClient.Condition('name', 'EQ', username)];
	docClient.query(params, function(err, result){
		if(err){
			console.log(err, err.stack)
		} else {
			jsonString = JSON.parse(JSON.stringify(result))
			if(jsonString["Count"] == 0){
				callback("none")
			} else {
				callback("found")
			}
		}
	})
}


//Generate the authentication token for account activation
function generateAuthToken(done){
	crypto.randomBytes(20, function(err, buf){
		var token = buf.toString('hex');
		done(err, token);
	})
}

function activate(user, token){
	var params = {};
	params.TableName = 'lecto-teachers';
	params.Key = {username: user}

	//update the authentication token to signify that the user has activated their account
	params.UpdateExpression = "set #token = :token";
	params.ExpressionAttributeNames = {"#token": "token"};
	params.ExpressionAttributeValues = {":token": token};

	docClient.updateItem(params, function(err, data){
		if(err){
			console.log(err, err.stack)
		} else {
			console.log("Account activated!")
		}
	})
}

//Load external assets for front-end
app.use(express.static(__dirname + '/public'));

//Load external js
app.use(express.static(__dirname + '/js'));

//Use bower components(JQuery)
app.use(express.static(__dirname + '/bower_components'));

app.use(express.static(__dirname + '/bower_components/peerjs'));

module.exports = app;