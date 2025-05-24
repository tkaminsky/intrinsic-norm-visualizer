// ui/help-overlay.js
export function buildHelpOverlay () {
    /* ── build DOM ─────────────────────────────────────────────── */
    const layer = document.createElement('div');
    layer.id = 'helpLayer';
    layer.innerHTML = `
      <style>
        #helpLayer        { position:fixed; inset:0;
                            background:rgba(0,0,0,.55);
                            display:flex; align-items:center; justify-content:center;
                            z-index:10000; }                /* sits on top */
        #helpBox          { width:min(800px, 90%);
                            max-height:80%; overflow:auto;
                            background:#fff; padding:28px 32px;
                            border-radius:12px; box-shadow:0 4px 24px rgba(0,0,0,.4);
                            font:16px/1.5 sans-serif; position:relative; }
  
        #helpClose        { position:absolute; left:14px; top:14px;
                            font:24px/24px sans-serif; cursor:pointer;
                            border:none; background:none; }
        #helpToggle       { position:fixed; right:18px; bottom:18px;
                            width:38px; height:38px; border-radius:50%;
                            border:none; background:#222; color:#fff; font:24px/38px sans-serif;
                            cursor:pointer; z-index:9999; }
      </style>
  
      <div id="helpBox">
          <button id="helpClose" title="Close">&times;</button>
  
          <h2 style="margin-top:0">Intrinsic Norm Visualizer</h2>

          <p>Hello, and welcome! This is a tool for visualizing <a href="https://www.mit.edu/~gfarina/2024/67220s24_L14B_self_concordance/L14.pdf" target="_blank">intrinsic norms</a> in the domains of some functions. There are a few ways to select/construct functions. Selecting a point on a manifold will transform it so all points have euclidean norm equal to the corresponding intrinsic norm (in the x-y plane). Hopefully, this can help you 'see' what the function looks like from the persective of the intrinsic norm!</p>

          <p>
          <strong>Choosing Functions</strong><br>
          <strong>Preset Functions</strong>: Click any of the buttons to load a pre-defined function.<br>
          <strong>Polygon Barrier</strong>: Create a polygon by selecting a sequence of points in the 2D grid in the top-left corner. Click the first vertex a second time to complete the polygon.<br>
          <strong>Removing Polygons</strong>: Click anywhere inside the interior of a polygon to remove it. </p>
        <p style="color:red;">
            <strong>Warning</strong>: If a polygon's barrier is strictly positive, it may not be visualized successfully. varying the <strong>max height</strong> parameter may help, but if its minimum is above the max height you might just have to try a different polygon. 
        </p>

        <p><strong>Functionality</strong><br>
                <strong>Hover</strong> over the surface to see the intrinic unit ball at that point.<br>
                <strong>Click</strong> to transform space to reflect that point's intrinsic norm.<br>
                <strong>Click Again</strong> revert to the global euclidean norm.<br>
          </p>

          <p><strong>Camera Controls</strong><br><strong>Rotate Z</strong>: Rotate the camera about the z-axis.<br>
             <strong>Zoom</strong>: Zoom view in/out.<br>
             <strong>Altitude</strong>: Change viewing height.</p>

             <p> Please feel free to reach me <a href="mailto:tkaminsky@g.harvard.edu">by email</a> with any questions, comments, or suggestions. I just learned about this, so it's very possible that I've made some mistakes, either conceptually or with the code. I look forward to any feedback you have! <br><br>
             ––Thomas
             </p>
  
          
  
          <p style="margin-bottom:0; font-size:90%; color:#555">
             (You can reopen these instructions later by clicking the “?” button.)</p>
      </div>
    `;
  
    const toggleBtn = document.createElement('button');
    toggleBtn.id   = 'helpToggle';
    toggleBtn.textContent = '?';
    toggleBtn.title = 'Show instructions';

    toggleBtn.style.cssText = `
    position:fixed; right:18px; bottom:18px;
    width:38px; height:38px; border-radius:50%;
    border:none; background:#222; color:#fff;
    font:24px/38px sans-serif; cursor:pointer;
    z-index:9999;
    `;
  
    /* ── behaviour ─────────────────────────────────────────────── */
    function show () { document.body.appendChild(layer); }
    function hide () { layer.remove(); }
  
    layer.querySelector('#helpClose').onclick = hide;
    toggleBtn.onclick = show;
  
    document.body.appendChild(toggleBtn); // always present
    show();                               // visible on first load
  }
  