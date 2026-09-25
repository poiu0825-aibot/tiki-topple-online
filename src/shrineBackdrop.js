import * as THREE from 'three';

export const SHRINE_BACKDROPS = ['海浪', '赤富士', '櫻霞', '松月', '雲鶴'];

/** Raised, original ukiyo-e inspired motifs. The torii and wall are separate. */
export function createShrineBackdrop(scene, index = 0) {
  const group = new THREE.Group();
  scene.add(group);
  const paint = color => new THREE.MeshStandardMaterial({ color, roughness: .92, metalness: 0, side: THREE.DoubleSide });
  const indigo = paint('#285b76'), blue = paint('#397d96'), lightBlue = paint('#79adc0'), foam = paint('#eee9d7');
  const red = paint('#ad4b3b'), rust = paint('#d2784f'), cream = paint('#f3dfb4'), ink = paint('#303d39'), pink = paint('#d88598');
  const shape = (points, mat, z = -2.26, depth = .06) => {
    const s = new THREE.Shape(); s.moveTo(points[0][0], points[0][1]); points.slice(1).forEach(([x,y])=>s.lineTo(x,y)); s.closePath();
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: .02, bevelSize: .025, bevelSegments: 1 }), mat);
    mesh.position.z = z; mesh.castShadow = true; group.add(mesh); return mesh;
  };
  const path = (points, radius, mat, z = -2.14) => {
    const curve = new THREE.CatmullRomCurve3(points.map(([x,y])=>new THREE.Vector3(x,y,z)));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(12, points.length*8), radius, 6, false), mat);
    mesh.castShadow = true; group.add(mesh); return mesh;
  };
  const disc = (x,y,r,mat,z=-2.13) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r,r,.09,32),mat);mesh.rotation.x=Math.PI/2;mesh.position.set(x,y,z);mesh.castShadow=true;group.add(mesh);return mesh;
  };
  const star = (x,y,r,mat) => { const mesh=new THREE.Mesh(new THREE.OctahedronGeometry(r,0),mat);mesh.position.set(x,y,-2.07);group.add(mesh);return mesh; };
  const type = ((Number(index) || 0) % 5 + 5) % 5;
  if (type === 0) {
    // Deep-water layers and curling, sculpted foam.
    shape([[-4.1,1.15],[4.1,1.15],[4.1,2.25],[3.4,2.56],[2.6,2.3],[1.7,2.77],[.6,2.36],[-.3,2.65],[-1.4,2.31],[-2.4,2.8],[-3.3,2.45],[-4.1,2.74]], indigo);
    shape([[-4.1,1.3],[4.1,1.3],[4.1,3.05],[3.5,3.42],[2.9,2.88],[1.9,3.45],[.8,3.1],[-.5,3.5],[-1.4,3.06],[-2.6,3.67],[-3.5,3.2],[-4.1,3.53]], blue,-2.18);
    for(let i=0;i<5;i++){
      const x=-3.8+i*1.75, y=3.1+(i%2)*.34;
      path([[x-.66,y-.15],[x-.25,y+.38],[x+.25,y+.56],[x+.58,y+.42],[x+.66,y+.05]],.085,lightBlue);
      path([[x-.2,y+.48],[x+.18,y+.67],[x+.52,y+.56]],.055,foam,-2.03);
      for(let n=0;n<3;n++)disc(x+.2+n*.2,y+.88+n*.09,.045,foam,-2.02);
    }
    disc(2.9,5.55,.5,cream,-2.23);
  } else if (type === 1) {
    // Red Fuji with its snow line and stacked warm cloud bands.
    disc(2.95,5.75,.68,cream,-2.28);
    shape([[-1.9,1.55],[3.75,1.55],[2.3,2.95],[1.2,5.85],[.74,5.87],[-.2,3.33]],red,-2.23,.1);
    shape([[.53,4.5],[.74,5.86],[1.2,5.84],[1.69,4.5],[1.25,4.7],[.92,4.49]],foam,-2.10);
    path([[-3.9,2.45],[-2.8,2.58],[-1.4,2.44],[.1,2.61]],.08,rust,-2.06);
    path([[2.15,3.18],[2.83,3.31],[3.95,3.16]],.08,rust,-2.03);
    for(let i=0;i<4;i++)path([[-3.75,4.5+i*.45],[-3.05,4.6+i*.45],[-2.25,4.52+i*.45]],.035,foam,-2.08);
  } else if (type === 2) {
    // Branches and raised blossoms against a pale spring haze.
    shape([[-4.1,1.45],[4.1,1.45],[4.1,2.1],[3,2.3],[1.7,2.07],[.4,2.3],[-1.1,2.08],[-2.8,2.35],[-4.1,2.16]],paint('#95b2a0'));
    path([[-3.7,1.35],[-2.6,2.2],[-2.1,3.25],[-1.2,4.15],[.2,4.74],[1.4,5.65]],.14,ink);
    path([[-2.1,3.25],[-.9,3.4],[.35,3.3],[1.75,3.86],[3.2,4.1]],.095,ink);
    path([[-1.2,4.15],[-1.75,5.25],[-2.7,5.75]],.07,ink);
    for(let i=0;i<22;i++){
      const x=-2.8+(i*37%62)/10, y=3.15+(i*23%29)/10;
      if(Math.abs(x)>4)continue;
      disc(x,y,.105+(i%3)*.018,i%4===0?cream:pink,-2.02+(i%3)*.01);
      star(x+.04,y+.025,.032,cream);
    }
  } else if (type === 3) {
    // Pine silhouette, full moon and distant hills.
    disc(2.6,5.5,1.02,cream,-2.25);
    shape([[-4.1,1.25],[4.1,1.25],[4.1,2.55],[3.1,2.28],[2.2,2.7],[1.1,2.35],[.1,2.8],[-1.4,2.3],[-2.5,2.74],[-4.1,2.36]],paint('#68878b'));
    path([[-3.4,1.5],[-3.2,2.8],[-2.85,3.8],[-2.1,4.6],[-1.3,5.1]],.17,ink);
    for(let i=0;i<6;i++){
      const y=3.2+i*.42,x=-3.15+i*.32;
      path([[x-.1,y],[x-.8,y+.16],[x-1.1,y+.32]],.09,ink);
      for(let j=0;j<5;j++)path([[x-.75+j*.14,y+.13],[x-1.02+j*.14,y+.34]],.027,paint('#34584a'),-2.0);
    }
    for(let i=0;i<7;i++)star(1.45+i*.36,3.2+(i%3)*.31,.03,cream);
  } else {
    // Cloud scrolls and two cranes in flight.
    for(let i=0;i<5;i++){
      const x=-4+i*1.95,y=2.2+(i%3)*.95;
      path([[x-.62,y],[x-.28,y+.22],[x+.16,y+.24],[x+.51,y+.1],[x+.9,y+.1]],.10,i%2?foam:lightBlue);
      path([[x+.2,y+.25],[x+.32,y+.5],[x+.62,y+.55]],.045,foam,-2.01);
    }
    disc(-2.3,5.55,.74,cream,-2.25);
    for(const [x,y,s] of [[.4,5.5,1],[2.6,4.85,.76]]){
      path([[x-1.05*s,y-.18*s],[x-.54*s,y+.16*s],[x,y],[x+.53*s,y+.19*s],[x+1.08*s,y-.16*s]],.075,ink,-2.03);
      path([[x,y],[x+.13*s,y-.43*s],[x+.28*s,y-.64*s]],.048,ink,-2.01);
      star(x+.05*s,y,.08,red);
    }
  }
  return { group, name: SHRINE_BACKDROPS[type] };
}
