// idk what this does
var path = require('path')
var bcrypt = require('bcryptjs'); //so you can use bcrypt features
var hash;
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



	/*queryParams.QueryFilter = docClient.Condition('password', 'EQ', docClient.getItem();*/ //If docClient.Condition checks for equality this
	docClient.query(queryParams, function(err, result){                                        //Otherwise we can use bcrypt.compareSync(__), which
		if(err){                                                                               //returns a boolean value based on equality
			done(new Error('Oh Shit!'));
			console.log(err, err.stack)
		} else {
			jsonString = JSON.parse(JSON.stringify(result))
			console.log(jsonString);

			if(bcrypt.compareSync(password,jsonString["Items"][0].password)) //returns True if the password is equal to the hash, otherwise False
			{
				 if(jsonString["Count"] != 0){
					console.log(jsonString["Items"][0].token)
					//Check if the user has activated through their email
					if(jsonString["Items"][0].token == "null"){
						done(null, false, {message: 'Account not activated. Please check your email'})
					} else {
						//Checks if there is an authentication token (to indicate that the user has authenticated)
						done(null, {id: username, name: jsonString["Items"].username});

					}
				} else{
					done(null, false, {message: 'Incorrect username or password'})
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


/**********************************ROUTES**********************************/ //TODO: Move this to a separate routes page
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

app.get('/category', function(req, res){
	res.render('category')
})

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

app.get('/archives', function(req, res){
	//Gets the names by parsing it out of the raw filename from s3
	getFiles(function(data){
		var names = parseList(data);
		res.render("archives", {
			secList: data,
			nameList: names
		})
	})
})

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

//Get the student page for the livestreaming service
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

//Get the new lecture
app.get('/newlect', function(req, res){
	var sessID = req.query.vid;
	res.render('newlect', {
		vid: sessID
	})
})

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

//Success screen after account creation
app.get('/success', function(req, res){
	res.render('success');
})

//Render the lecto page
app.get('/lecto', function(req, res){
	res.render('lecto', {
		username: req.user.name
	});
});

/**************** POST CALLS *********************/
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

	res.redirect('/success')
});

//redirect to the embedded live stream
app.post('/student', function(req, res){
	var sid = encodeURIComponent(req.body.sessionID);
	res.redirect('/student?sid=' + sid);
})

//redirect to the newlect page
app.post('/newlect', function(req, res){
	var vid = encodeURIComponent(req.body.sessionID);
	res.redirect('/newlect?vid=' + vid);
})

//Post login information - redirect accordingly and show the respective messages
app.post('/login', passport.authenticate('local', {successRedirect:'/dashboard', failureRedirect:'/login', failureFlash: true}));

app.post('/dashboard', function(req, res){
	deleteSession(req.body.username)
	res.redirect('/dashboard')
})

//Redirects to this page once it's done uploading a video
app.post('/goodupload', function(req, res){
	res.render('goodupload')
});


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
//Usersnames which are currently connected to the chat
var usernames = {};
var rooms = [];
// Socket.io connection for live text chat
io.sockets.on('connection', function(socket){
		//Joining rooms
		socket.on('adduser', function(sessionDesc){
			console.log(sessionDesc);
			//store the username in the socket session for this client
			var username = sessionDesc[0];
			var roomName = sessionDesc[1];

			//This is so the server knows who just joined the room
			socket.username = username

			//joining the actual chat room
			socket.room = roomName;
			socket.join(roomName);
			rooms.push(roomName);

			//Tell the client that a new user has joined this room
			socket.emit('updatechat', 'SERVER', 'you have connected to ' + roomName);
			socket.broadcast.to(roomName).emit('updateChat', 'SERVER', username + ' has connected to ' + roomName);
			socket.emit('updateRooms', rooms, roomName);
	});

	//Sending actual chat messages
	socket.on('sendchat', function(data){
		//tell the client to execute 'updatechat' with 2 paramteres
		io.sockets.in(socket.room).emit('updatechat', socket.username, data);
	});

	//What to tell the server when the client has disconnected
	socket.on('disconnect', function(){
		//remove he username from the usernames list
		delete usernames[socket.username];
		//update list of users in chat, client side
		io.sockets.emit('updateusers', usernames);
		//echo globally that this client has left
		socket.broadcast.emit('updatechat', 'SERVER', socket.username + 'has disconnected');
		socket.leave(socket.room);

	})
})

/*********************************FUNCTIONS**************************************/
//Creates the user account
function register(username, password, email){
	AWS.config.update({accessKeyId: AWS_ACCESS_KEY, secretAccessKey: AWS_SECRET_KEY});
	var params = {};
	params.TableName = 'lecto-teachers';

	//npm install bcrypt in order for this to work
	//Obtains secure random numbers


	var salt = bcrypt.genSaltSync(10);
	hash = bcrypt.hashSync(password, salt);

	//Add more parameters later (comments, reviews)
	//replaced password with hash (because we never store the password, just the hash of the password)
	params.Item = {username: username, password: hash, email: email, token: "null"};
	docClient.putItem(params, function(err, data){
		if(err){
			console.log(err, err.stack)
		} else {
			console.log("Account successfully created!");
			console.log(params);
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

//Attach an authentication token to the user's account in the DynamoDB
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

//Lists all the files
function getFiles(callback){
	var params = {};
	params.Bucket = 'lecto-vids';
	params.EncodingType = "url";

	s3.listObjects(params, function(err, data){
		if(err){
			console.log(err);
		} else {
			var jsonString = JSON.parse(JSON.stringify(data));
			var list = [];
			console.log(jsonString["Contents"].length);
			for(var i = 0; i < jsonString["Contents"].length; i ++){
				list.push(jsonString["Contents"][i].Key);
			}
			callback(list);
		}
	})
}

//Parses the names out of the raw datalist of s3 file urls
function parseList(list){
	var nameStrings = [];
	for(var i = 0; i < list.length; i++){
		var rawString = list[i];
		var parsedString = rawString.substring(rawString.indexOf('/') + 1, rawString.indexOf("+"));
		var nameString = parsedString.replace("%25", " ");
		nameStrings.push(nameString);
	}
	return nameStrings;

}


//Load external assets for front-end
app.use(express.static(__dirname + '/public'));

//Load external js
app.use(express.static(__dirname + '/js'));

//Use bower components(JQuery)
app.use(express.static(__dirname + '/bower_components'));

app.use(express.static(__dirname + '/bower_components/peerjs'));

module.exports = app;
