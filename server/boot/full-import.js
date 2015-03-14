module.exports = function ( server ) {
	var router = server.loopback.Router();

	router.get( '/full-import', function ( req, res ) {
		res.send( process.env );
	} );

	server.use( router );
};
