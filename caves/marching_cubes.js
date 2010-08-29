// Marching cubes in Javascript
//
// Yes, this is madness. But this should test those JS engines!
// Does not do simple optimizations like vertex sharing. Nevertheless,
// performance is quite acceptable on Chrome.
//
// Converted from the standard C implementation that's all over the web.

function MarchingCubesEffect() {
  var program = createProgramFromTags("marching_cube_vs", "marching_cube_fs");
  var textures = {
      diffuseSamplerWall: tdl.textures.loadTexture('assets/rock-color.png'),
      diffuseSamplerFloor: tdl.textures.loadTexture('assets/sand-color.png')
  };

  var dlist = new DisplayList();

  var worldview = new Float32Array(16);
  var viewproj = new Float32Array(16);
  var worldviewproj = new Float32Array(16);

  var eyePosition = new Float32Array([0, 1.7, 0]);
  var target = new Float32Array([0, 0, 0]);

  // Size of field.
  var size = 32;
  var blockSize = 16 + 1;
  // Deltas
  var delta = 1.0;
  var yd = blockSize;
  var zd = blockSize * blockSize;
  var blockSize3 = blockSize * blockSize * blockSize;

  var tree = new field.FieldNode(0, 0, 0, size, blockSize - 1);

  var normal_cache = new Float32Array(blockSize3 * 3);
  
  var modelMap = {};
  
  var m4 = tdl.fast.matrix4

  // Temp buffers used in polygonize.
  var vlist = new Float32Array(12 * 3);
  var nlist = new Float32Array(12 * 3);
  
  function wipeNormals() {
    // Wipe the normal cache.
    for (var i = 0; i < blockSize3; ++i) {
      normal_cache[i * 3 + 0] = 0.0;
      normal_cache[i * 3 + 1] = 0.0;
      normal_cache[i * 3 + 2] = 1.0;
    }
  }

  function lerp(a,b,t) { return a + (b - a) * t; }
  function VIntX(q,pout,nout,offset,isol,x,y,z,valp1,valp2) {
    var mu = (isol - valp1) / (valp2 - valp1);
    pout[offset + 0] = x + mu * delta;
    pout[offset + 1] = y;
    pout[offset + 2] = z;
  }
  function VIntY(q,pout,nout,offset,isol,x,y,z,valp1,valp2) {
    var mu = (isol - valp1) / (valp2 - valp1);
    pout[offset + 0] = x;
    pout[offset + 1] = y + mu * delta;
    pout[offset + 2] = z;
    var q2 = q + yd*3;
  }
  function VIntZ(q,pout,nout,offset,isol,x,y,z,valp1,valp2) {
    var mu = (isol - valp1) / (valp2 - valp1);
    pout[offset + 0] = x;
    pout[offset + 1] = y;
    pout[offset + 2] = z + mu * delta;
    var q2 = q + zd*3;
  }

  // Returns total number of triangles. Fills triangles.
  // TODO: Optimize to death, add normal calculations so that we can run
  // proper lighting shaders on the results. The grid parameter should be
  // implicit and removed.
  function polygonize(fx, fy, fz, q, isol, field, nodeSize) {
    var cubeindex = 0;
    var field0 = field[q];
    var field1 = field[q+1];
    var field2 = field[q+yd];
    var field3 = field[q+1+yd];
    var field4 = field[q+zd];
    var field5 = field[q+1+zd];
    var field6 = field[q+yd+zd];
    var field7 = field[q+1+yd+zd];
    
    if (field0 < isol) cubeindex |= 1;
    if (field1 < isol) cubeindex |= 2;
    if (field2 < isol) cubeindex |= 8;
    if (field3 < isol) cubeindex |= 4;
    if (field4 < isol) cubeindex |= 16;
    if (field5 < isol) cubeindex |= 32;
    if (field6 < isol) cubeindex |= 128;
    if (field7 < isol) cubeindex |= 64;

    // If cube is entirely in/out of the surface - bail, nothing to draw.
    var bits = edgeTable[cubeindex];
    if (bits == 0) return 0;

    var d = delta;
    var fx2 = fx + d, fy2 = fy + d, fz2 = fz + d;

    // Top of the cube
    if (bits & 1)    {VIntX(q*3,      vlist, nlist, 0, isol, fx,  fy,  fz, field0, field1); }
    if (bits & 2)    {VIntY((q+1)*3,  vlist, nlist, 3, isol, fx2, fy,  fz, field1, field3); }
    if (bits & 4)    {VIntX((q+yd)*3, vlist, nlist, 6, isol, fx,  fy2, fz, field2, field3); }
    if (bits & 8)    {VIntY(q*3,      vlist, nlist, 9, isol, fx,  fy,  fz, field0, field2); }
    // Bottom of the cube
    if (bits & 16)   {VIntX((q+zd)*3,    vlist, nlist, 12, isol, fx,  fy,  fz2, field4, field5); }
    if (bits & 32)   {VIntY((q+1+zd)*3,  vlist, nlist, 15, isol, fx2, fy,  fz2, field5, field7); }
    if (bits & 64)   {VIntX((q+yd+zd)*3, vlist, nlist, 18, isol, fx,  fy2, fz2, field6, field7); }
    if (bits & 128)  {VIntY((q+zd)*3,    vlist, nlist, 21, isol, fx,  fy,  fz2, field4, field6); }
    // Vertical lines of the cube
    if (bits & 256)  {VIntZ(q*3,        vlist, nlist, 24, isol, fx,  fy,  fz, field0, field4); }
    if (bits & 512)  {VIntZ((q+1)*3,    vlist, nlist, 27, isol, fx2, fy,  fz, field1, field5); }
    if (bits & 1024) {VIntZ((q+1+yd)*3, vlist, nlist, 30, isol, fx2, fy2, fz, field3, field7); }
    if (bits & 2048) {VIntZ((q+yd)*3,   vlist, nlist, 33, isol, fx,  fy2, fz, field2, field6); }

    cubeindex <<= 4;  // Re-purpose cubeindex into an offset into triTable.
    var numtris = 0, i = 0;
    while (triTable[cubeindex + i] != -1) {
      dlist.posnormtriv(vlist, nlist,
                      3 * triTable[cubeindex + i + 0],
                      3 * triTable[cubeindex + i + 1],
                      3 * triTable[cubeindex + i + 2]);
      i += 3;
      numtris++;
    }
    return numtris;
  }

  function addBall(ballx, bally, ballz, radius) {
    var scanradius = radius * size + 1;
    var min_x = Math.max(Math.floor(ballx * size - scanradius), 0);
    var max_x = Math.min(Math.floor(ballx * size + scanradius), size);
    var min_y = Math.max(Math.floor(bally * size - scanradius), 0);
    var max_y = Math.min(Math.floor(bally * size + scanradius), size);
    var min_z = Math.max(Math.floor(ballz * size - scanradius), 0);
    var max_z = Math.min(Math.floor(ballz * size + scanradius), size);
    function uniform(minNodeX, minNodeY, minNodeZ, nodeSize, value) {
      // TODO: intersect sphere with cube to avoid unnecessary splits.
      // TODO: allow 'set value' response for interior cubes.
      return true;  // 'Please subdivide this node.'
    }
    function buffer(minNodeX, minNodeY, minNodeZ, nodeSize, array) {
      var min2_x = Math.max(min_x, minNodeX);
      var max2_x = Math.min(max_x, minNodeX + nodeSize);
      var min2_y = Math.max(min_y, minNodeY);
      var max2_y = Math.min(max_y, minNodeY + nodeSize);
      var min2_z = Math.max(min_z, minNodeZ);
      var max2_z = Math.min(max_z, minNodeZ + nodeSize);
      for (var z = min2_z; z < max2_z; ++z) {
        var z_offset = nodeSize * nodeSize * z;
        var fz = z / size - ballz;
        var fz2 = fz * fz;
        for (var y = min2_y; y < max2_y; ++y) {
          var y_offset = z_offset + nodeSize * y;
          var fy = y / size - bally;
          var fy2 = fy * fy;
          for (var x = min2_x; x < max2_x; ++x) {
            var fx = x / size - ballx;
            var fx2 = fx * fx;
            var dist = Math.sqrt(fx2 + fy2 + fz2);
            var val = Math.pow(dist / radius, 2.0);
            array[y_offset + x] *= Math.max(Math.min(val, 1.0), 0.0);
          }
        }
      }
    }
    tree.walkSubTree(min_x, max_x, min_y, max_y, min_z, max_z, uniform, buffer);
  }
  
  function createGeometry(isol) {
    function uniform(minNodeX, minNodeY, minNodeZ, nodeSize, value) {
      return false;  // Don't subdivide.
    }
    function buffer(minNodeX, minNodeY, minNodeZ, nodeSize, array) {
      wipeNormals();
      dlist.begin();
      var size2 = nodeSize / 2.0;
      for (var z = 1; z < nodeSize - 2; z++) {
        var z_offset = nodeSize * nodeSize * z;
        var fz = minNodeZ + z;
        for (var y = 1; y < nodeSize - 2; y++) {
          var y_offset = z_offset + nodeSize * y;
          var fy = minNodeY + y;
          for (var x = 1; x < nodeSize - 2; x++) {
            var fx = minNodeX + x;
            var q = y_offset + x;
            polygonize(fx, fy, fz, q, isol, array, nodeSize);
          }
        }
      }
      var modelArrays = dlist.end();
      var key = minNodeX + ':' + minNodeY + ':' + minNodeZ;
      modelMap[key] = new tdl.models.Model(program, modelArrays, textures);
    }
    tree.walkTree(uniform, buffer);
  }

  var firstDraw = true;

  this.render = function(framebuffer, time, world, view, proj) {
    m4.mul(viewproj, view, proj);
    m4.mul(worldview, world, view);
    m4.mul(worldviewproj, world, viewproj);

    gl.clearColor(0.0,0.0,0.2,1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);

    var uniformsConst = {
      u_worldviewproj: worldviewproj,
      u_worldview: worldview,
      u_world: world,
      u_lightDir: [-1.0, 1.0, 1.0],
      u_lightColor: [0.8, 0.7, 0.6, 1.0],
      u_ambientUp: [0.1, 0.2, 0.4, 1.0],
      u_ambientDown: [0.3, 0.15, 0.02, 1.0],
    }

    if (firstDraw) {
      firstDraw = false;

      var radius = 0.2;
      addBall(0.5, 0.5, 0.5, 0.25);
      for (var i = 0; i < 2; ++i) {
        function randm11() { return Math.random() * 2 - 1; }
        var ballx = randm11() * 0.27 + 0.5;
        var bally = randm11() * 0.27 + 0.5;
        var ballz = randm11() * 0.27 + 0.5;
        addBall(ballx, bally, ballz, radius);
      }

      var isol = 0.5;
      createGeometry(isol);
      
      for (var key in modelMap) {
        console.log(key);
        console.log(modelMap[key].buffers.indices.numElements_);
      }
    }
    
    for (var key in modelMap) {
      var model = modelMap[key];
      if (model.buffers.indices.numElements_ > 0) {
        model.drawPrep(uniformsConst);
        model.draw(uniformsConst);
      }
    }
  }
}
