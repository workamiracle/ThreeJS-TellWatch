import * as THREE from "three";
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import { toCreasedNormals, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import WebGL from 'three/addons/capabilities/WebGL.js';

import { CustomOutlinePass } from "./CustomOutlinePass.js";
import FindSurfaces from "./FindSurfaces.js";

let camera, scene, renderer, controls, watch;
let composer, effectFXAA, customOutline, depthTexture, renderTarget;

let showTooltip = true;

let timer;
let camSpeed;

const clock = new THREE.Clock();

let mixer;

const camPos1 = [-0.3, 1.0, 0.5], camPos2 = [0, 1.2, 0.3];
let camPos = camPos1;

init();
animate();

function init() {
	if ( WebGL.isWebGL2Available() === false ) {

		document.body.appendChild( WebGL.getWebGL2ErrorMessage() );
		return;

	}

	const container = document.createElement( 'div' );
	document.body.appendChild( container );

	renderer = new THREE.WebGLRenderer( { antialias: true, alpha: true } );

	camera = new THREE.PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 0.1, 2000 );
	camera.position.set( ...camPos );

	scene = new THREE.Scene();
	scene.background = new THREE.Color( 0xffffff);
	//scene.fog = new THREE.Fog( 0xa0a0a0, 200, 1000 );

	const hemiLight = new THREE.HemisphereLight( 0xffffff, 0x444444 );
	hemiLight.position.set( 0, 200, 0 );
	//scene.add( hemiLight );

	const pointLight = new THREE.PointLight( 0xaaaaaa, 2, 800 );
	pointLight.position.set(120, 100, 100);
	pointLight.castShadow = true;
	scene.add(pointLight);

	const dirLight = new THREE.DirectionalLight( 0xffffff, 1 );
	dirLight.position.set( -120, 200, -20 );
	dirLight.castShadow = true;
	dirLight.shadow.camera.top = 180;
	dirLight.shadow.camera.bottom = - 100;
	dirLight.shadow.camera.left = - 120;
	dirLight.shadow.camera.right = 120;
	scene.add( dirLight );

	//scene.add( new THREE.AmbientLight( 0x222222 ) );

	// ground
	const mesh = new THREE.Mesh( new THREE.PlaneGeometry( 2000, 2000 ), new THREE.MeshPhongMaterial( { color: 0x999999, depthWrite: false } ) );
	mesh.rotation.x = - Math.PI / 2;
	mesh.receiveShadow = true;
	mesh.position.set(0, 0, 0);
	//scene.add( mesh );

	// Set up post processing
	// Create a render target that holds a depthTexture so we can use it in the outline pass
	depthTexture = new THREE.DepthTexture();
	renderTarget = new THREE.WebGLRenderTarget(
		window.innerWidth,
		window.innerHeight,
		{
			depthTexture: depthTexture,
			depthBuffer: true,
			samples: 8
		}
	);

	// Initial render pass.
	composer = new EffectComposer(renderer, renderTarget);
	const pass = new RenderPass(scene, camera);
	composer.addPass(pass);

	// Outline pass.
	customOutline = new CustomOutlinePass(
		new THREE.Vector2(window.innerWidth, window.innerHeight),
		scene,
		camera
	);
	const uniforms = customOutline.fsQuad.material.uniforms;
	uniforms.debugVisualize.value = 0;
	uniforms.outlineColor.value.set('#222222');
	uniforms.multiplierParameters.value.x = 5;
	uniforms.multiplierParameters.value.y = 0;
	uniforms.multiplierParameters.value.z = 0.5;
	uniforms.multiplierParameters.value.w = 0.2;


	composer.addPass(customOutline);

	// Antialias pass.
	effectFXAA = new ShaderPass(FXAAShader);	

	const surfaceFinder = new FindSurfaces();

	const phongM = new THREE.MeshPhongMaterial( {
		bumpScale: 1,
		color: new THREE.Color().setRGB(1, 1, 1),
		specular: new THREE.Color().setRGB(1.0, 1.0, 1.0),
		reflectivity: 0.9,
		shininess: 100,
		envMap: null
	} );

	const basicM = new THREE.MeshBasicMaterial({});


	// model
	const loader = new GLTFLoader();
	loader.load( './models/Xbot.glb', function ( object ) {

		mixer = new THREE.AnimationMixer( object.scene );
		const action = mixer.clipAction( object.animations[ 0 ] );
		action.play();
		

		console.log(object);
		object.scene.traverse( function ( child ) {

      if ( child.isMesh ) {
	      child.castShadow = true;
	      child.receiveShadow = true;
				child.material = basicM;		

				//child.geometry.computeAngleVertexNormals(Math.PI/2);
				//child.geometry = mergeVertices(child.geometry, 1e-2);
				//child.geometry.computeVertexNormals();
      }

		} );

		watch = object.scene;
		watch.position.set(0, 0, 0);
		//watch.scale.set(10, 10, 10);

		scene.add( watch );

		surfaceFinder.surfaceId = 0;

		watch.traverse((node) => {
			if (node.type == "Mesh") {
				const colorsTypedArray = surfaceFinder.getSurfaceIdAttribute(node);
				node.geometry.setAttribute(
					"color",
					new THREE.BufferAttribute(colorsTypedArray, 4)
				);
			}
		});

		customOutline.updateMaxSurfaceId(surfaceFinder.surfaceId + 1);
	} );

	
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	renderer.shadowMap.enabled = true;
	container.appendChild( renderer.domElement );

	const pixelRatio = renderer.getPixelRatio();

  effectFXAA.material.uniforms["resolution"].value.set(
    1 / (window.innerWidth * pixelRatio),
    1 / (window.innerHeight * pixelRatio)
  );
	composer.addPass(effectFXAA);

	controls = new OrbitControls( camera, renderer.domElement );
	controls.enabled = false;
	controls.target.set( 0, 0, 0 );
	controls.update();

	window.addEventListener( 'resize', onWindowResize, false );
	window.addEventListener( 'mousedown', onMouseDown, false );
}

function onMouseDown() {
	if(showTooltip) {
		camSpeed = [(camPos2[0] - camPos1[0]) / 200, (camPos2[1] - camPos1[1]) / 200, (camPos2[2] - camPos1[2]) / 200];
		timer = setInterval(moveCamera, 20);

		showTooltip = false;

		document.getElementById('tooltip').style.display = 'none';
	}
}

function moveCamera() {
	camPos = [camPos[0] + camSpeed[0], camPos[1] + camSpeed[1], camPos[2] + camSpeed[2]];
	camera.position.set(...camPos);

	if(camPos[0] > camPos2[0] || camPos[1] > camPos2[1] || camPos[2] < camPos2[2]) {
		camSpeed = [-camSpeed[0], -camSpeed[1], -camSpeed[2]];
	}

	if(camPos[0] < camPos1[0] || camPos[1] < camPos1[1] || camPos[2] > camPos1[2]) {
		clearInterval(timer);
		showTooltip = true;
		document.getElementById('tooltip').style.display = 'block';
	}
	//controls.target.set( 0, 0, 0 );
	controls.update();
}

function onWindowResize() {
	console.log(window.innerHeight, window.innerWidth);

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );

	composer.setSize(window.innerWidth, window.innerHeight);
  effectFXAA.setSize(window.innerWidth, window.innerHeight);
  customOutline.setSize(window.innerWidth, window.innerHeight);

	const pixelRatio = renderer.getPixelRatio();

  effectFXAA.material.uniforms["resolution"].value.set(
    1 / (window.innerWidth * pixelRatio),
    1 / (window.innerHeight * pixelRatio)
  );
}

//

function animate() {

	requestAnimationFrame( animate );

	const delta = clock.getDelta();

	if ( mixer ) mixer.update( delta );

	//renderer.render( scene, camera );
	composer.render();
}

THREE.BufferGeometry.prototype.computeAngleVertexNormals = function(angle){
	function weightedNormal( normals, vector ) {

		var normal = new THREE.Vector3();

		for ( var i = 0, l = normals.length; i < l; i ++ ) {

			if ( normals[ i ].angleTo( vector ) < angle ) {

				normal.add( normals[ i ] );

			}

		}

		return normal.normalize();

	}

	//this.computeFaceNormals();

	var vertexNormals = [];

	for ( var i = 0, l = this.vertices.length; i < l; i ++ ) {

		vertexNormals[ i ] = [];

	}

	for ( var i = 0, fl = this.faces.length; i < fl; i ++ ) {

		var face = this.faces[ i ];

		vertexNormals[ face.a ].push( face.normal );
		vertexNormals[ face.b ].push( face.normal );
		vertexNormals[ face.c ].push( face.normal );

	}

	for ( var i = 0, fl = this.faces.length; i < fl; i ++ ) {

		var face = this.faces[ i ];

		face.vertexNormals[ 0 ] = weightedNormal( vertexNormals[ face.a ], face.normal );
		face.vertexNormals[ 1 ] = weightedNormal( vertexNormals[ face.b ], face.normal );
		face.vertexNormals[ 2 ] = weightedNormal( vertexNormals[ face.c ], face.normal );

	}

	if ( this.faces.length > 0 ) {

		this.normalsNeedUpdate = true;

	}

}