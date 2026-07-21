import { RenderPipeline, BlendMode, NormalBlending } from "three/webgpu";
import { pass, mrt, output, emissive, vec4 } from "three/tsl";
import { UnsignedByteType } from "three";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { fxaa } from "three/addons/tsl/display/FXAANode.js";
import { createCyberpunkLook } from "./look/cyberpunkLook.js";

export function createPostProcessing(renderer, scene, camera) {
  const post = new RenderPipeline(renderer);

  const scenePass = pass(scene, camera);
  const mrtNode = mrt({
    output,
    emissive: vec4(emissive, output.a),
  });
  mrtNode.setBlendMode("emissive", new BlendMode(NormalBlending));
  scenePass.setMRT(mrtNode);

  const scenePassColor = scenePass.getTextureNode("output");
  const scenePassEmissive = scenePass.getTextureNode("emissive");

  scenePass.getTexture("emissive").type = UnsignedByteType;

  const bloomPass = bloom(scenePassEmissive, 3, 0.5);
  const bloomPassWide = bloom(scenePassEmissive, 1.25, 1);

  const look = createCyberpunkLook({ scenePass });

  // FXAA wants tone-mapped / graded input (unlike SMAA, which prefers linear).
  // Applying after look also avoids SMAA's multi-target RenderAttachment conflicts.
  const composed = look.buildComposite(scenePassColor, {
    bloomContribution: bloomPass.add(bloomPassWide),
  });
  const finalOutput = fxaa(composed);
  post.outputNode = finalOutput;

  function restoreCombinedOutput() {
    post.outputNode = finalOutput;
    post.needsUpdate = true;
  }

  function applyLookPreset(id, options = {}) {
    return look.applyPreset(id, {
      bloomPass,
      bloomPassWide,
      ...options,
    });
  }

  function resizePostProcessing() {
    const width = Math.max(1, renderer.domElement.width);
    const height = Math.max(1, renderer.domElement.height);
    scenePass.setSize(width, height);
  }

  return {
    post,
    bloomPass,
    bloomPassWide,
    look,
    applyLookPreset,
    restoreCombinedOutput,
    resizePostProcessing,
    scenePassColor,
    scenePassEmissive,
  };
}
