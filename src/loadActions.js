import * as THREE from "three";

export const loadActions = (mixer, animation) => {
  const actions = {};

  actions['closed'] = mixer.clipAction(THREE.AnimationUtils.subclip(animation, 'closed', 0, 160, 25));
  actions['explosion'] = mixer.clipAction(THREE.AnimationUtils.subclip(animation, 'explosion', 160, 490, 25));
  actions['exploded'] = mixer.clipAction(THREE.AnimationUtils.subclip(animation, 'exploded', 260, 490, 25));
  actions['unfolding'] = mixer.clipAction(THREE.AnimationUtils.subclip(animation, 'unfolding', 490, 1152, 25));
  actions['unfolded'] = mixer.clipAction(THREE.AnimationUtils.subclip(animation, 'unfolded', 608, 1152, 25));
  actions['folding'] = mixer.clipAction(THREE.AnimationUtils.subclip(animation, 'folding', 1152, 1411, 25));
  actions['folded'] = mixer.clipAction(THREE.AnimationUtils.subclip(animation, 'folded', 1219, 1411, 25));
  actions['closing'] = mixer.clipAction(THREE.AnimationUtils.subclip(animation, 'closing', 1411, 1600, 25));


  return actions;
}
