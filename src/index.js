import * as THREE from "three";
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import WebGL from 'three/addons/capabilities/WebGL.js';

import { CustomOutlinePass } from "./CustomOutlinePass.js";
import FindSurfaces from "./FindSurfaces.js";
import { loadActions } from "./loadActions.js";
import { States } from "./States.js";

let camera, scene, renderer, controls, watch;
let composer, effectFXAA, customOutline, depthTexture, renderTarget;

let showTooltip = true;

let timer, idleTimer;
let curRot = [-Math.PI / 4, 0.0, -Math.PI], curPos = [-0.5, -0.3, 0], nextRot, nextPos, prevRot, prevPos, rotCount;

const clock = new THREE.Clock();

let mixer, actions, action, animation;

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

		mixer.addEventListener('finished', (e) => {
			console.log(e.action.getClip().name);

			if(e.action.getClip().name == 'explosion') {
				e.action.reset();
				e.action.time = e.action.getClip().duration - 9;
				e.action.play();
			} else if(e.action.getClip().name == 'unfolding') {
				e.action.reset();
				e.action.time = e.action.getClip().duration - 10;
				e.action.play();
			} else if(e.action.getClip().name == 'folding') {
				e.action.reset();
				e.action.time = e.action.getClip().duration - 6;
				e.action.play();
			} else if(e.action.getClip().name == 'closing') {
				e.action.reset();
				e.action.time = e.action.getClip().duration - 3;
				e.action.play();
			}
		});

		animation = object.animations[0];
		//action = mixer.clipAction(THREE.AnimationUtils.subclip(animation, 'explosion', 160, 490, 25));		
		action = mixer.clipAction(THREE.AnimationUtils.subclip(animation, 'closed', 0, 160, 25));
		//const action = mixer.clipAction(THREE.AnimationUtils.subclip(object.animations[ 0 ], 'unfolding', 260, 490, 25));
		//action.loop = THREE.LoopPingPong;
		action.play();
		//actions['folded'].play();
		//actions['closed'].play(); 

		
		object.scene.traverse( function ( child ) {

      if ( child.isMesh ) {
	      child.castShadow = true;
	      child.receiveShadow = true;
				child.material = basicM;
      }

		} );

		watch = object.scene;
		watch.position.set(...curPos);
		watch.rotation.set(...curRot);
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

	document.getElementById('dial-backward').addEventListener('click', () => launchAnimation(States.backward, false));
	document.getElementById('dial-forward').addEventListener('click', () => launchAnimation(States.backward, true));

	document.getElementById('movement-backward').addEventListener('click', () => launchAnimation(States.closed, false));
	document.getElementById('movement-forward').addEventListener('click', () => launchAnimation(States.closed, true));

	document.getElementById('explosion-backward').addEventListener('click', () => launchAnimation(States.exploded, false));
	document.getElementById('explosion-forward').addEventListener('click', () => launchAnimation(States.exploded, true));

	document.getElementById('organs-backward').addEventListener('click', () => launchAnimation(States.unfolded, false));
	document.getElementById('organs-forward').addEventListener('click', () => launchAnimation(States.unfolded, true));

	Array.prototype.forEach.call(document.getElementsByClassName('POIs'), (item) => {
		item.addEventListener('click', (e) => {
			if(e.target.lastElementChild !== null) {
				Array.prototype.forEach.call(document.getElementById('POI').children, (item) => {
					Array.prototype.forEach.call(item.children, (pois) => {
						if(pois.lastElementChild !== null) pois.lastElementChild.classList.remove('show');
					});
				});

				e.target.lastElementChild.classList.toggle('show');
			} 
		});
	});

	document.getElementById('POI-click').addEventListener('click', () => {
		Array.prototype.forEach.call(document.getElementById('POI').children, (item) => {
			Array.prototype.forEach.call(item.children, (pois) => {
				if(pois.lastElementChild !== null) pois.lastElementChild.classList.remove('show');
			});
		});
	});
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
let speed1 = 80, speed2 = 40;		//	Change these values. The smaller they are, the faster the rotation and translation is.
function discoverMore() {
	document.getElementById('discover-more').style.display = 'none';
	clearInterval(timer);
	clearInterval(idleTimer);

	prevPos = curPos;
	prevRot = curRot;
	nextPos = [0.0, -0.3, 0.0];
	//nextRot = [0.0, 0.0, 0.0];
	let steps;

	nextRot = [curRot[0], Math.PI, curRot[2]];
	steps = parseInt((Math.PI - curRot[1]) / Math.PI * speed1);
	rotCount = steps;

	moveCount = steps > 100 ? steps - 60 : steps - 5;
	idleTimer = setInterval(() => discoverMore2(steps), 20);
	timer = setInterval(() => discoverMore1(steps > 100 ? steps - 60 : steps - 5), 20);
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
		rotCount = speed2;
		prevRot = curRot;
		nextRot = [0.0, curRot[1], curRot[2]];
		prevPos = curPos;
		nextPos = [0.0, 0.0, 0.0];
		timer = setInterval(() => discoverMore3(speed2), 20);		
	}
}
function discoverMore3(steps) {
	curRot = [(nextRot[0] - prevRot[0]) / steps + curRot[0], (nextRot[1] - prevRot[1]) / steps + curRot[1], (nextRot[2] - prevRot[2]) / steps + curRot[2]];
	curPos = [(nextPos[0] - prevPos[0]) / steps + curPos[0], (nextPos[1] - prevPos[1]) / steps + curPos[1], (nextPos[2] - prevPos[2]) / steps + curPos[2]];
	
	watch.position.set(...curPos);
	watch.rotation.set(...curRot);

	if((--rotCount) == 0) {
		clearInterval(timer);

		document.getElementById('button-bar').style.display = 'block';
		document.getElementById('POI-backward').style.display = 'block';

		document.getElementById('dial-current').style.display = 'block';
		document.getElementById('dial-forward').style.display = 'none';
		document.getElementById('dial-backward').style.display = 'none';

		document.getElementById('movement-current').style.display = 'none';
		document.getElementById('movement-forward').style.display = 'block';
		document.getElementById('movement-backward').style.display = 'none';

		document.getElementById('explosion-current').style.display = 'none';
		document.getElementById('explosion-forward').style.display = 'block';
		document.getElementById('explosion-backward').style.display = 'none';

		document.getElementById('organs-current').style.display = 'none';
		document.getElementById('organs-forward').style.display = 'block';
		document.getElementById('organs-backward').style.display = 'none';
		curState = States.backward;
	}
}
function discoverMore4(steps) {
	curRot = [(nextRot[0] - prevRot[0]) / steps + curRot[0], (nextRot[1] - prevRot[1]) / steps + curRot[1], (nextRot[2] - prevRot[2]) / steps + curRot[2]];
	watch.rotation.set(...curRot);

	if(curRot[0] >= Math.PI) curRot[0] -= Math.PI * 2;

	if((--rotCount) == 0) {
		clearInterval(timer);
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
	curRot = [curRot[0] + Math.PI / 120, 0.0, 0.0];
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
let curState;
function launchAnimation(state, forward) {
	console.log(state);
	if(curState != States.transition) {
		if(state == States.backward) document.getElementById('left-bar').style.width = '12.5%';
		else if(state == States.closed) document.getElementById('left-bar').style.width = '37.5%';
		else if(state == States.exploded) document.getElementById('left-bar').style.width = '62.5%';
		else if(state == States.unfolded) document.getElementById('left-bar').style.width = '87.5%';
	}

	if(curState == States.backward) {
		curState = States.transition;
		clearInterval(timer);
		
		rotCount = 120;
		prevRot = curRot;
		nextRot = [Math.PI + curRot[0], curRot[1], curRot[2]];
		timer = setInterval(() => discoverMore4(120), 20);

		document.getElementById('dial-current').style.display = 'none';
		document.getElementById('dial-backward').style.display = 'block';
		document.getElementById('POI-backward').style.display = 'none';
	
		if(state == States.closed) {
			document.getElementById('movement-current').style.display = 'block';
			document.getElementById('movement-forward').style.display = 'none';
		} else if(state == States.exploded) {
			document.getElementById('explosion-current').style.display = 'block';
			document.getElementById('explosion-forward').style.display = 'none';
			document.getElementById('movement-backward').style.display = 'block';
			document.getElementById('movement-forward').style.display = 'none';
		} else if(state == States.unfolded) {
			document.getElementById('explosion-backward').style.display = 'block';
			document.getElementById('explosion-forward').style.display = 'none';
			document.getElementById('movement-backward').style.display = 'block';
			document.getElementById('movement-forward').style.display = 'none';
			document.getElementById('organs-current').style.display = 'block';
			document.getElementById('organs-forward').style.display = 'none';
		}
		
		setTimeout(() => {
			if(state == States.closed) {
				curState = state;
				document.getElementById('POI-closed').style.display = 'block';
			}
			else {
				action.stop();
				if(state == States.exploded) {
					action = mixer.clipAction(THREE.AnimationUtils.subclip(animation, 'explosion', 160, 490, 25));					
					
					setTimeout(() => {
						curState = state;
						document.getElementById('POI-exploded').style.display = 'block';
					}, 4500);
				} else if(state == States.unfolded) {
					action = mixer.clipAction(THREE.AnimationUtils.subclip(animation, 'unfolding', 160, 1152, 25));					
					
					setTimeout(() => {
						curState = state;
						document.getElementById('POI-unfolded').style.display = 'block';
					}, 18000);
				}
				action.setLoop(THREE.LoopOnce);
				action.play();	
			}
		}, 2400);
	} else if(curState == States.closed) {
		curState = States.transition;

		document.getElementById('movement-current').style.display = 'none';
		document.getElementById('POI-closed').style.display = 'none';

		if(state == States.backward) {
			document.getElementById('movement-forward').style.display = 'block';
			document.getElementById('dial-backward').style.display = 'none';
			document.getElementById('dial-current').style.display = 'block';
		} else if(state == States.exploded) {
			document.getElementById('movement-backward').style.display = 'block';
			document.getElementById('explosion-current').style.display = 'block';
			document.getElementById('explosion-forward').style.display = 'none';
		} else if(state == States.unfolded) {
			document.getElementById('movement-backward').style.display = 'block';
			document.getElementById('organs-current').style.display = 'block';
			document.getElementById('organs-forward').style.display = 'none';
			document.getElementById('explosion-backward').style.display = 'block';
			document.getElementById('explosion-forward').style.display = 'none';
		}

		if(state == States.backward) {
			clearInterval(timer);
			
			rotCount = 120;
			prevRot = curRot;
			nextRot = [Math.PI + curRot[0], curRot[1], curRot[2]];
			timer = setInterval(() => discoverMore4(120), 20);
			setTimeout(() => {
				curState = state;
				document.getElementById('POI-backward').style.display = 'block';
			}, 2400);
		} else {
			action.stop();

			if(state == States.exploded) {
				action = mixer.clipAction(THREE.AnimationUtils.subclip(animation, 'explosion', 160, 490, 25));				
					
				setTimeout(() => {
					curState = state;
					document.getElementById('POI-exploded').style.display = 'block';
				}, 4500);
			} else if(state == States.unfolded) {
				action = mixer.clipAction(THREE.AnimationUtils.subclip(animation, 'unfolding', 160, 1152, 25));					
				
				setTimeout(() => {
					curState = state;
					document.getElementById('POI-unfolded').style.display = 'block';
				}, 18000);
			}
			action.setLoop(THREE.LoopOnce);
			action.play();
		}
	} else if(curState == States.exploded) {
		curState = States.transition;

		document.getElementById('explosion-current').style.display = 'none';
		document.getElementById('POI-exploded').style.display = 'none';

		if(state == States.backward) {
			document.getElementById('explosion-forward').style.display = 'block';
			document.getElementById('dial-backward').style.display = 'none';
			document.getElementById('dial-current').style.display = 'block';
			document.getElementById('movement-backward').style.display = 'none';
			document.getElementById('movement-forward').style.display = 'block';
		} else if(state == States.closed) {
			document.getElementById('explosion-forward').style.display = 'block';
			document.getElementById('movement-current').style.display = 'block';
			document.getElementById('movement-backward').style.display = 'none';
		} else if(state == States.unfolded) {
			document.getElementById('explosion-backward').style.display = 'block';
			document.getElementById('organs-current').style.display = 'block';
			document.getElementById('organs-forward').style.display = 'none';
		}

		action.stop();

		if(state == States.backward) {
			action = mixer.clipAction(THREE.AnimationUtils.subclip(animation, 'closing', 1411, 1600, 25));	
			action.setLoop(THREE.LoopOnce);
			action.play();

			setTimeout(() => {
				clearInterval(timer);
			
				rotCount = 120;
				prevRot = curRot;
				nextRot = [Math.PI + curRot[0], curRot[1], curRot[2]];
				timer = setInterval(() => discoverMore4(120), 20);
				setTimeout(() => {
					curState = state;
					document.getElementById('POI-backward').style.display = 'block';
				}, 2400);
			}, 4000);
		} else {
			if(state == States.closed) {
				action = mixer.clipAction(THREE.AnimationUtils.subclip(animation, 'closing', 1411, 1600, 25));				
					
				setTimeout(() => {
					curState = state;
					document.getElementById('POI-closed').style.display = 'block';
				}, 4000);
			} else if(state == States.unfolded) {
				action = mixer.clipAction(THREE.AnimationUtils.subclip(animation, 'unfolding', 490, 1152, 25));					
				
				setTimeout(() => {
					curState = state;
					document.getElementById('POI-unfolded').style.display = 'block';
				}, 5000);
			}
			action.setLoop(THREE.LoopOnce);
			action.play();
		}
	} else if(curState == States.unfolded) {
		curState = States.transition;

		document.getElementById('organs-current').style.display = 'none';
		document.getElementById('organs-forward').style.display = 'block';
		document.getElementById('POI-unfolded').style.display = 'none';

		if(state == States.backward) {
			document.getElementById('dial-backward').style.display = 'none';
			document.getElementById('dial-current').style.display = 'block';
			document.getElementById('movement-backward').style.display = 'none';
			document.getElementById('movement-forward').style.display = 'block';
			document.getElementById('explosion-backward').style.display = 'none';
			document.getElementById('explosion-forward').style.display = 'block';
		} else if(state == States.closed) {
			document.getElementById('movement-current').style.display = 'block';
			document.getElementById('movement-backward').style.display = 'none';
			document.getElementById('explosion-forward').style.display = 'block';
			document.getElementById('explosion-backward').style.display = 'none';
		} else if(state == States.exploded) {
			document.getElementById('explosion-current').style.display = 'block';
			document.getElementById('explosion-backward').style.display = 'none';
		}

		action.stop();

		if(state == States.backward) {
			action = mixer.clipAction(THREE.AnimationUtils.subclip(animation, 'closing', 1152, 1600, 25));			
			action.setLoop(THREE.LoopOnce);
			action.play();

			setTimeout(() => {
				clearInterval(timer);
			
				rotCount = 120;
				prevRot = curRot;
				nextRot = [Math.PI + curRot[0], curRot[1], curRot[2]];
				timer = setInterval(() => discoverMore4(120), 20);
				setTimeout(() => {
					curState = state;
					document.getElementById('POI-backward').style.display = 'block';
				}, 2400);
			}, 15000);
		} else {
			if(state == States.closed) {
				action = mixer.clipAction(THREE.AnimationUtils.subclip(animation, 'closing', 1152, 1600, 25));				
					
				setTimeout(() => {
					curState = state;
					document.getElementById('POI-closed').style.display = 'block';
				}, 15000);
			} else if(state == States.exploded) {
				action = mixer.clipAction(THREE.AnimationUtils.subclip(animation, 'folding', 1152, 1411, 25));					
				
				setTimeout(() => {
					curState = state;
					document.getElementById('POI-exploded').style.display = 'block';
				}, 3000);
			}
			action.setLoop(THREE.LoopOnce);
			action.play();
		}
	}

}