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
import { loadActions } from "./loadActions.js";
import { States } from "./States.js";

let camera, scene, renderer, controls, watch;
let composer, effectFXAA, customOutline, depthTexture, renderTarget;

let showTooltip = true;

let timer, idleTimer;
let curRot = [-Math.PI / 4, 0, 0], curPos = [-0.45, -0.3, 0], nextRot, nextPos, prevRot, prevPos, rotCount;

const clock = new THREE.Clock();

let mixer, actions;

init();
animate();

function init() {
	if ( WebGL.isWebGL2Available() === false ) {

		document.body.appendChild( WebGL.getWebGL2ErrorMessage() );
		return;

	}

	const container = document.getElementById( 'webgl-canvas' );

	renderer = new THREE.WebGLRenderer( { antialias: true, alpha: true } );

	camera = new THREE.PerspectiveCamera( 60, window.innerWidth > window.innerHeight ? window.innerWidth / window.innerHeight : 1, 0.1, 2000 );
	camera.position.set( 0.0, 1.5, 0.0 );

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

	// ProgressBar and Bar
	let progressbar = document.getElementById('bar');
	let progress = document.getElementById('progress');

	// model
	const loader = new GLTFLoader();
	loader.load( './models/tellwatch_all1.glb', function ( object ) {

		mixer = new THREE.AnimationMixer( object.scene );
		mixer.addEventListener('loop', (e) => {
			if(e.action.getClip().name == 'explosion') {
				e.action.time = 5;
			} else if(e.action.getClip().name == 'unfolding') {
				e.action.time = 6;
			} else if(e.action.getClip().name == 'folding') {
				e.action.time = 4;
			}
		});
		mixer.addEventListener('finished', (e) => {
			if(e.action.getClip().name == 'explosion') {
				e.action.reset();
				e.action.time = 5;
				e.action.play();
			} else if(e.action.getClip().name == 'unfolding') {
				e.action.reset();
				e.action.time = 6;
				e.action.play();
			} else if(e.action.getClip().name == 'folding') {
				e.action.reset();
				e.action.time = 4;
				e.action.play();
			}
		});

		actions = loadActions(mixer, object.animations[0]);
		const action = mixer.clipAction( object.animations[ 0 ] );
		//const action = mixer.clipAction(THREE.AnimationUtils.subclip(object.animations[ 0 ], 'unfolding', 260, 490, 25));
		//action.loop = THREE.LoopPingPong;
		//action.play();
		//actions['folded'].play();
		actions['closed'].play(); 

		
		object.scene.traverse( function ( child ) {

      if ( child.isMesh ) {
	      child.castShadow = true;
	      child.receiveShadow = true;
				child.material = basicM;
      }

		} );

		watch = object.scene;
		watch.position.set(-0.45, -0.3, 0);
		watch.rotation.set(-Math.PI / 4, 0, 0);
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

		progress.style.display = 'none';
		container.style.display = 'block';
		document.getElementById('discover-more').style.display = 'block';

		idleTimer = setInterval(idle, 20);
	}, 
	function (xhr) {
		progressbar.style.width = ( xhr.loaded / xhr.total * 100 ) + '%';
	} );

	
	renderer.setPixelRatio( window.devicePixelRatio );
	if(window.innerWidth > window.innerHeight)
		renderer.setSize( window.innerWidth, window.innerHeight );
	else
		renderer.setSize( window.innerWidth, window.innerWidth );
	//renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	//renderer.shadowMap.enabled = true;
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

	// UI Events
	document.getElementById('discover-more').addEventListener('click', discoverMore);
	document.getElementById('rotate').addEventListener('click', larotation);
	document.getElementById('launch-btn').addEventListener('click', launchAnimation);
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

//	General Move and Rotation
function moveAndRotate() {
	curPos = [(nextPos[0] - prevPos[0]) / 200 + curPos[0], (nextPos[1] - prevPos[1]) / 200 + curPos[1], (nextPos[2] - prevPos[2]) / 200 + curPos[2]];
	curRot = [(nextRot[0] - prevRot[0]) / 200 + curRot[0], (nextRot[1] - prevRot[1]) / 200 + curRot[1], (nextRot[2] - prevRot[2]) / 200 + curRot[2]];

	watch.rotation.set(...curRot);
	watch.position.set(...curPos);

	if((--rotCount) == 0) clearTimeout(timer);	
}

//	Discover More

let moveCount;
function discoverMore() {
	document.getElementById('discover-more').style.display = 'none';
	clearInterval(timer);
	clearInterval(idleTimer);

	prevPos = curPos;
	prevRot = curRot;
	nextPos = [0.0, -0.3, 0.0];
	//nextRot = [0.0, 0.0, 0.0];
	let steps;

		if(curRot[1] < 0) {
			nextRot = [curRot[0], 0, curRot[2]];
			steps = parseInt((0 - curRot[1]) / Math.PI * 120);
			rotCount = steps;
		} else {
			nextRot = [curRot[0], Math.PI * 2, curRot[2]];
			steps = parseInt((Math.PI * 2 - curRot[1]) / Math.PI * 120);
			rotCount = steps;
		}

	moveCount = steps > 45 ? steps - 45 : steps - 5;
	idleTimer = setInterval(() => discoverMore2(steps), 20);
	timer = setInterval(() => discoverMore1(steps > 45 ? steps - 45 : steps - 5), 20);
}

function discoverMore1(steps) {
	curPos = [(nextPos[0] - prevPos[0]) / steps + curPos[0], (nextPos[1] - prevPos[1]) / steps + curPos[1], (nextPos[2] - prevPos[2]) / steps + curPos[2]];
	
	watch.position.set(...curPos);

	if((--moveCount) == 0) {
		clearInterval(timer);		
	}
}
function discoverMore2(steps) {
	curRot = [(nextRot[0] - prevRot[0]) / steps + curRot[0], (nextRot[1] - prevRot[1]) / steps + curRot[1], (nextRot[2] - prevRot[2]) / steps + curRot[2]];
	
	watch.rotation.set(...curRot);

	if((--rotCount) == 0) {
		clearInterval(idleTimer);
		rotCount = 60;
		prevRot = curRot;
		nextRot = [0.0, curRot[1], curRot[2]];
		prevPos = curPos;
		nextPos = [0.0, 0.0, 0.0];
		timer = setInterval(() => discoverMore3(60), 20);		
	}
}
function discoverMore3(steps) {
	curRot = [(nextRot[0] - prevRot[0]) / steps + curRot[0], (nextRot[1] - prevRot[1]) / steps + curRot[1], (nextRot[2] - prevRot[2]) / steps + curRot[2]];
	curPos = [(nextPos[0] - prevPos[0]) / steps + curPos[0], (nextPos[1] - prevPos[1]) / steps + curPos[1], (nextPos[2] - prevPos[2]) / steps + curPos[2]];
	
	watch.position.set(...curPos);
	watch.rotation.set(...curRot);

	if((--rotCount) == 0) {
		clearInterval(timer);
		document.getElementById('rotate').style.display = 'block';
		document.getElementById('button-bar').style.display = 'block';
		document.getElementById('prev-passive').style.display = 'none';
		document.getElementById('prev-active').style.display = 'none';
		document.getElementById('next-passive').style.display = 'none';
		document.getElementById('next-active').style.display = 'block';
	}
}

// Rotation at La Rotation
let laRotating = false, laForward = true;
function larotation() {
	if(!laRotating) {
		laRotating = true;
		document.getElementById('button-bar').style.display = 'none';

		timer = setInterval(laRotation1, 20);
	}
}
function laRotation1() {
	curRot = [curRot[0] + Math.PI / 160, 0.0, 0.0];
	if(laForward && curRot[0] >= Math.PI) {
		clearInterval(timer);
		laForward = false;
		curRot[0] = -Math.PI;
		laRotating = false;
	} else if(!laForward && curRot[0] >= 0.0) {
		clearInterval(timer);
		laForward = true;
		curRot[0] = 0.0;
		laRotating = false;
		document.getElementById('button-bar').style.display = 'block';
	}

	watch.rotation.set(...curRot);
}

//	Rotation at the beginning
function idle() {
	curRot[1] += Math.PI / 180;
	if(curRot[1] >= Math.PI) curRot[1] -= 2 * Math.PI;
	
	watch.rotation.set(...curRot);
}

//	Animations
let curState = States.closed, prevState = States.closed;
function launchAnimation() {	

	if(curState == States.closed) {
		prevState = curState;
		curState = States.explosion;

		actions['explosion'].play();
		actions['closed'].stop();

		document.getElementById('prev-text').innerHTML = 'Explosion';
		document.getElementById('btn-text').innerHTML = 'Lancer<br/><b>le démantèlement</b>';

		document.getElementById('prev-passive').style.display = 'block';
		document.getElementById('prev-active').style.display = 'none';
		document.getElementById('next-passive').style.display = 'none';
		document.getElementById('next-active').style.display = 'block';
		document.getElementById('launch-btn').classList.add('launch-btn-right');
		document.getElementById('launch-btn').classList.remove('launch-btn-left');

		setTimeout(() => {
			prevState = curState;
			curState = States.exploded;
		}, 5000);		

		document.getElementById('rotate').style.display = 'none';
		
	} else if(curState == States.exploded) {
		prevState = curState;
		curState = States.unfolding;

		actions['unfolding'].play();
		actions['explosion'].stop();
		actions['folding'].stop();

		document.getElementById('next-text').innerHTML = 'Démantèlement';
		document.getElementById('btn-text').innerHTML = 'Revenir<br/><b>à l’explosion</b>';

		document.getElementById('prev-passive').style.display = 'none';
		document.getElementById('prev-active').style.display = 'block';
		document.getElementById('next-passive').style.display = 'block';
		document.getElementById('next-active').style.display = 'none';
		document.getElementById('launch-btn').classList.add('launch-btn-left');
		document.getElementById('launch-btn').classList.remove('launch-btn-right');

		setTimeout(() => {
			prevState = curState;
			curState = States.unfolded;
		}, 6000);
	}  else if(curState == States.unfolded) {
		prevState = curState;
		curState = States.folding;

		actions['folding'].play();
		actions['unfolding'].stop();

		document.getElementById('prev-text').innerHTML = 'Explosion';
		document.getElementById('btn-text').innerHTML = 'Lancer<br/><b>le démantèlement</b>';

		document.getElementById('prev-passive').style.display = 'block';
		document.getElementById('prev-active').style.display = 'none';
		document.getElementById('next-passive').style.display = 'none';
		document.getElementById('next-active').style.display = 'block';
		document.getElementById('launch-btn').classList.add('launch-btn-right');
		document.getElementById('launch-btn').classList.remove('launch-btn-left');

		setTimeout(() => {
			prevState = curState;
			curState = States.exploded;
		}, 5000);
	}
}