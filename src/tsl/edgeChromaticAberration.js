import { TempNode } from "three/webgpu";
import {
  nodeObject,
  Fn,
  convertToTexture,
  float,
  vec2,
  vec4,
  uv,
  fract,
  sin,
  dot,
} from "three/tsl";

/**
 * Post processing node for applying edge-based chromatic aberration effect.
 * Applies chromatic aberration only at the screen edges using a radial falloff
 * that keeps the center unaffected.
 */
class EdgeChromaticAberrationNode extends TempNode {
  static get type() {
    return "EdgeChromaticAberrationNode";
  }

  constructor(textureNode, strengthNode, edgeFalloffNode, centerNode) {
    super("vec4");

    this.textureNode = textureNode;
    this.strengthNode = strengthNode;
    this.edgeFalloffNode = edgeFalloffNode;
    this.centerNode = centerNode;
  }

  setup() {
    const textureNode = this.textureNode;
    const uvNode = textureNode.uvNode || uv();

    const dither = Fn(([screenPos]) => {
      const hash = fract(
        sin(dot(screenPos, vec2(12.9898, 78.233))).mul(float(43758.5453)),
      );
      return hash.sub(float(0.5)).mul(float(2.0)).mul(float(0.004));
    }).setLayout({
      name: "Dither",
      type: "float",
      inputs: [{ name: "screenPos", type: "vec2" }],
    });

    const ApplyEdgeChromaticAberration = Fn(
      ([uvCoord, strength, edgeFalloff, center]) => {
        const offset = uvCoord.sub(center);
        const distance = offset.length();

        const edgeMask = float(1.0).sub(
          float(1.0).div(float(1.0).add(distance.mul(edgeFalloff).pow(2.0))),
        );

        const effectiveStrength = strength.mul(edgeMask);

        const redOffset = offset.mul(
          float(1.0).add(effectiveStrength.mul(0.015)),
        );
        const greenOffset = offset;
        const blueOffset = offset.mul(
          float(1.0).sub(effectiveStrength.mul(0.015)),
        );

        const redUV = center.add(redOffset);
        const greenUV = center.add(greenOffset);
        const blueUV = center.add(blueOffset);

        const r = textureNode.sample(redUV).r;
        const g = textureNode.sample(greenUV).g;
        const b = textureNode.sample(blueUV).b;
        const a = textureNode.sample(uvCoord).a;

        const ditherValue = dither(uvCoord);
        const ditheredR = r.add(ditherValue);
        const ditheredG = g.add(ditherValue);
        const ditheredB = b.add(ditherValue);

        return vec4(ditheredR, ditheredG, ditheredB, a);
      },
    ).setLayout({
      name: "EdgeChromaticAberrationShader",
      type: "vec4",
      inputs: [
        { name: "uv", type: "vec2" },
        { name: "strength", type: "float" },
        { name: "edgeFalloff", type: "float" },
        { name: "center", type: "vec2" },
      ],
    });

    const chromaticAberrationFn = Fn(() => {
      return ApplyEdgeChromaticAberration(
        uvNode,
        this.strengthNode,
        this.edgeFalloffNode,
        this.centerNode,
      );
    });

    return chromaticAberrationFn();
  }
}

export default EdgeChromaticAberrationNode;

/**
 * TSL function for creating an edge-based chromatic aberration node.
 *
 * @param {Node<vec4>} node - Input of the effect.
 * @param {Node|number} [strength=1.0] - Chromatic aberration strength.
 * @param {Node|number} [edgeFalloff=3.0] - Falloff from edges to center (higher = more concentrated at edges).
 * @param {?(Node|Vector2)} [center=null] - Center point. Defaults to screen center (0.5, 0.5).
 */
export const edgeChromaticAberration = (
  node,
  strength = 1.0,
  edgeFalloff = 3.0,
  center = null,
) => {
  if (center === null) {
    center = vec2(0.5, 0.5);
  }

  return nodeObject(
    new EdgeChromaticAberrationNode(
      convertToTexture(node),
      nodeObject(strength),
      nodeObject(edgeFalloff),
      nodeObject(center),
    ),
  );
};
