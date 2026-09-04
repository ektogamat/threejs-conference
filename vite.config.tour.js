import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname( fileURLToPath( import.meta.url ) );
const siblingThreeDir = resolve( rootDir, '../three.js' );
const packagedThreeDir = resolve( rootDir, 'node_modules/three' );
const devThreeDir = existsSync( siblingThreeDir )
	? siblingThreeDir
	: packagedThreeDir;
const threeExamplesDir = resolve( devThreeDir, 'examples' );
const threeFilesDir = existsSync( resolve( devThreeDir, 'files' ) )
	? resolve( devThreeDir, 'files' )
	: resolve( siblingThreeDir, 'files' );

const MIME_TYPES = {
	'.json': 'application/json',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.html': 'text/html',
	'.svg': 'image/svg+xml',
	'.glb': 'model/gltf-binary',
	'.gltf': 'model/gltf+json',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.webp': 'image/webp',
	'.ico': 'image/x-icon',
};

function serveTourDependencies() {

	const fsPrefix = `/@fs/${devThreeDir.replace( /\\/g, '/' )}`;

	return ( req, res, next ) => {

		const url = req.url.split( '?' )[ 0 ];

		// 1. Redirect /build/ requests to Vite's local fs path to share the same module instance
		if ( url.startsWith( '/build/' ) ) {

			const redirectUrl = `${fsPrefix}${url}`;
			res.writeHead( 307, {
				Location: redirectUrl,
				'Cache-Control': 'no-store, max-age=0'
			} );
			res.end();
			return;

		}

		// 2. Redirect /examples/jsm/ requests to Vite's local fs path to share module instances
		if ( url.startsWith( '/examples/jsm/' ) ) {

			const redirectUrl = `${fsPrefix}${url}`;
			res.writeHead( 307, { Location: redirectUrl } );
			res.end();
			return;

		}

		// 3. Map other static /examples/ requests (textures, models, etc.) to ../three.js/examples/
		if ( url.startsWith( '/examples/' ) && ! url.startsWith( '/examples/jsm/' ) ) {

			const relativePath = url.slice( '/examples/'.length );
			const filePath = resolve( threeExamplesDir, relativePath );
			if ( existsSync( filePath ) ) {

				const ext = extname( filePath );
				res.setHeader( 'Content-Type', MIME_TYPES[ ext ] ?? 'application/octet-stream' );
				res.setHeader( 'Cache-Control', 'no-store, max-age=0' );
				res.end( readFileSync( filePath ) );
				return;

			}

		}

		// 4. Map /files/ requests (favicon, etc.) to ../three.js/files/
		if ( url.startsWith( '/files/' ) ) {

			const relativePath = url.slice( '/files/'.length );
			const filePath = resolve( threeFilesDir, relativePath );
			if ( existsSync( filePath ) ) {

				const ext = extname( filePath );
				res.setHeader( 'Content-Type', MIME_TYPES[ ext ] ?? 'application/octet-stream' );
				res.setHeader( 'Cache-Control', 'no-store, max-age=0' );
				res.end( readFileSync( filePath ) );
				return;

			}

		}

		// 5. Intercept /js/imports/scripts/ to serve raw files (bypassing Vite compilation)
		if ( url.startsWith( '/js/imports/scripts/' ) ) {

			const relativePath = url.slice( '/js/imports/scripts/'.length );
			const filePath = resolve( rootDir, 'tour/js/imports/scripts', relativePath );
			if ( existsSync( filePath ) ) {

				const ext = extname( filePath );
				res.setHeader( 'Content-Type', MIME_TYPES[ ext ] ?? 'application/octet-stream' );
				res.setHeader( 'Cache-Control', 'no-store, max-age=0' );
				res.end( readFileSync( filePath ) );
				return;

			} else {

				res.statusCode = 404;
				res.setHeader( 'Content-Type', 'text/plain' );
				res.end( `File not found: ${relativePath}` );
				return;

			}

		}

		// 5. Map /src/ requests to the actual /src/ folder
		if ( url.startsWith( '/src/' ) ) {

			const relativePath = url.slice( '/src/'.length );
			const filePath = resolve( rootDir, 'src', relativePath );
			if ( existsSync( filePath ) ) {

				const ext = extname( filePath );
				res.setHeader( 'Content-Type', MIME_TYPES[ ext ] ?? 'application/octet-stream' );
				res.setHeader( 'Cache-Control', 'no-store, max-age=0' );
				res.end( readFileSync( filePath ) );
				return;

			}

		}

		next();

	};

}

export default defineConfig( {
	root: 'tour',
	publicDir: '../public',
	server: {
		host: true,
		open: true,
		fs: {
			allow: [
				resolve( rootDir, 'tour' ),
				resolve( rootDir, 'node_modules' ),
				devThreeDir,
			],
		},
	},
	resolve: {
		alias: {
			'three/webgpu': resolve( devThreeDir, 'build/three.webgpu.js' ),
			'three/tsl': resolve( devThreeDir, 'build/three.tsl.js' ),
			'three/addons/': resolve( devThreeDir, 'examples/jsm' ) + '/',
			'three': resolve( devThreeDir, 'build/three.webgpu.js' ),
			'tsl-textures': 'https://cdn.jsdelivr.net/gh/boytchev/tsl-textures/dist/tsl-textures.js',
			'marked': 'https://cdn.jsdelivr.net/npm/marked@12.0.1/lib/marked.esm.js',
			'acorn': 'https://cdn.jsdelivr.net/npm/acorn@8.11.3/dist/acorn.mjs',
			'eslint-linter-browserify': 'https://cdn.jsdelivr.net/npm/eslint-linter-browserify@8.57.0/linter.mjs',
			'mermaid': 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs',
		},
	},
	optimizeDeps: {
		exclude: [
			'three',
			'three/webgpu',
			'three/tsl',
			'three/addons/',
			'tsl-textures',
			'marked',
			'acorn',
			'eslint-linter-browserify',
			'mermaid',
		],
	},
	plugins: [
		basicSsl(),
		{
			name: 'serve-tour-dependencies',
			configureServer( server ) {

				server.middlewares.use( serveTourDependencies() );

			},
			configurePreviewServer( server ) {

				server.middlewares.use( serveTourDependencies() );

			},
		},
	],
} );
