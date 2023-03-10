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

const camPos1 = [-0.0, 1.0, 0.0], camPos2 = [0, 1.2, 0.3];
let camPos = camPos1;

init();
animate();

function init() {
	if ( WebGL.isWebGL2Available() === false ) {

		document.body.appendChild( WebGL.getWebGL2ErrorMessage() );
		return;

	}

	const container = document.getElementById( 'webgl-canvas' );

	renderer = new THREE.WebGLRenderer( { antialias: true, alpha: true } );

	camera = new THREE.PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 0.1, 2000 );
	camera.position.set( ...camPos );

	scene = new THREE.Scene();
	scene.background = new THREE.Color( 0xffffff);
	

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

	const basicM = new THREE.MeshBasicMaterial({});


	// model
	const loader = new GLTFLoader();
	loader.load( './models/tellwatch_exterieur.glb', function ( object ) {

		mixer = new THREE.AnimationMixer( object.scene );
		const action = mixer.clipAction( object.animations[ 0 ] );
		action.play();
		
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
	container.append( renderer.domElement );

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
}

function onWindowResize() {
	camera.aspect = window.innerWidth > window.innerHeight ? window.innerWidth / window.innerHeight : 1;
	camera.updateProjectionMatrix();

	if(window.innerWidth > window.innerHeight)
		renderer.setSize( window.innerWidth, window.innerHeight );
	else
		renderer.setSize( window.innerWidth, window.innerWidth );
		

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
