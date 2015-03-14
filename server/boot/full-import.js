var Dropbox = require( 'dropbox' );
var AWS = require( 'aws-sdk' );
var minimatch = require( 'minimatch' );


module.exports = function ( server ) {
	var router = server.loopback.Router();

	router.get( '/full-import', function ( req, res ) {
		var env = process.env;

		executeFullImport( {
			DROPBOX_API_KEY:    env.DROPBOX_API_KEY,
			DROPBOX_API_SECRET: env.DROPBOX_API_SECRET,
			DROPBOX_API_TOKEN:  env.DROPBOX_API_TOKEN,
			DROPBOX_DIR:        env.DROPBOX_DIR,
			AWS_ACCESS_KEY_ID:  env.AWS_ACCESS_KEY_ID,
			AWS_SECRET_KEY:     env.AWS_SECRET_KEY,
			AWS_QUEUE_REGION:   env.AWS_QUEUE_REGION,
			AWS_QUEUE_URL:      env.AWS_QUEUE_REGION
		} );
	} );

	server.use( router );
};

function executeFullImport( environmentSettings ) {
	var dropboxClient = new Dropbox.Client( {
		key:     environmentSettings.DROPBOX_API_KEY,
		secret:  environmentSettings.DROPBOX_API_SECRET,
		token:   environmentSettings.DROPBOX_API_TOKEN,
		sandbox: false
	} );

	dropboxClient.authDriver( new Dropbox.AuthDriver.NodeServer( 8191 ) );

	dropboxClient.authenticate( function ( error, client ) {
		if ( error ) {
			// Replace with a call to your own error-handling code.
			//
			// Don't forget to return from the callback, so you don't execute the code
			// that assumes everything went well.
			return showError( error );
		}

		// Replace with a call to your own application code.
		//
		// The user authorized your app, and everything went well.
		// client is a Dropbox.Client instance that you can use to make API calls.
		dropboxClient.readdir( environmentSettings.DROPBOX_DIR, function ( error, entries ) {
			if ( error ) {
				return showError( error );  // Something went wrong.
			}

			function extractId( iStockFilename ) {
				var regex = /iStock_(.*)_.*/g;
				var result = regex.exec( iStockFilename );
				return result[ 1 ];
			}

			entries.forEach( function ( entry ) {
				if ( minimatch( entry, 'iStock_*' ) ) {
					var asset = {
						type:     'iStock',
						iStockId: extractId( entry ),
						filename: entry
					};

					var message = {
						type:  'import',
						asset: asset
					};

					sendSqsMessage( environmentSettings, JSON.stringify( message ) );
				}
			} );
		} );
	} );
}

function sendSqsMessage( environmentSettings, messageBody ) {
	AWS.config.update( {
		accessKeyId:     environmentSettings.AWS_ACCESS_KEY_ID,
		secretAccessKey: environmentSettings.AWS_SECRET_KEY,
		region:          environmentSettings.AWS_QUEUE_REGION
	} );

	var sqs = new AWS.SQS();

	var params = {
		MessageBody:  messageBody || '',
		QueueUrl:     environmentSettings.AWS_QUEUE_URL,
		DelaySeconds: 0
	};

	sqs.sendMessage( params, function ( err, data ) {
		if ( err ) {
			console.log( err, err.stack );
		} // an error occurred
		else {
			console.log( 'Message sent to SQS: ' + params.MessageBody );
		}
	} );
}

function showError( error ) {
	switch ( error.status ) {
		case Dropbox.ApiError.INVALID_TOKEN:
			// If you're using dropbox.js, the only cause behind this error is that
			// the user token expired.
			// Get the user through the authentication flow again.
			break;

		case Dropbox.ApiError.NOT_FOUND:
			// The file or folder you tried to access is not in the user's Dropbox.
			// Handling this error is specific to your application.
			break;

		case Dropbox.ApiError.OVER_QUOTA:
			// The user is over their Dropbox quota.
			// Tell them their Dropbox is full. Refreshing the page won't help.
			break;

		case Dropbox.ApiError.RATE_LIMITED:
			// Too many API requests. Tell the user to try again later.
			// Long-term, optimize your code to use fewer API calls.
			break;

		case Dropbox.ApiError.NETWORK_ERROR:
			// An error occurred at the XMLHttpRequest layer.
			// Most likely, the user's network connection is down.
			// API calls will not succeed until the user gets back online.
			break;

		case Dropbox.ApiError.INVALID_PARAM:
		case Dropbox.ApiError.OAUTH_ERROR:
		case Dropbox.ApiError.INVALID_METHOD:
		default:
		// Caused by a bug in dropbox.js, in your application, or in Dropbox.
		// Tell the user an error occurred, ask them to refresh the page.
	}
}
