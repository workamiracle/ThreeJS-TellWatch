import * as THREE from "three";

export const loadActions = (mixer, animation) => {
  const actions = {};

  actions['closed'] = mixer.clipAction(THREE.AnimationUtils.subclip(animation, 'closed', 0, 160, 25));
  actions['explosion'] = mixer.clipAction(THREE.AnimationUtils.subclip(animation, 'explosion', 160, 491, 25));
  actions['exploded'] = mixer.clipAction(THREE.AnimationUtils.subclip(animation, 'exploded', 260, 491, 25));
  actions['unfolding'] = mixer.clipAction(THREE.AnimationUtils.subclip(animation, 'unfolding', 491, 1153, 25));
  actions['unfolded'] = mixer.clipAction(THREE.AnimationUtils.subclip(animation, 'unfolded', 608, 1153, 25));
  actions['folding'] = mixer.clipAction(THREE.AnimationUtils.subclip(animation, 'folding', 1153, 1412, 25));
  actions['folded'] = mixer.clipAction(THREE.AnimationUtils.subclip(animation, 'folded', 1219, 1412, 25));
  actions['closing'] = mixer.clipAction(THREE.AnimationUtils.subclip(animation, 'closing', 1411, 1600, 25));


  return actions;
}
