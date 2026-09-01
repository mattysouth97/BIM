import { describe, expect, it, beforeEach } from "vitest";
import { useRenderStore } from "../render-store";
import { getRenderRuntime } from "@/lib/rendering/runtime";

describe("useRenderStore", () => {
  beforeEach(() => {
    useRenderStore.setState({
      mode: "realistic",
      quality: "high",
      timeOfDay: "12:00",
      weather: "clear",
      cameraPreset: "architectural-exterior",
    });
    useRenderStore.getState().setMode("realistic");
  });

  it("defaults to realistic / high / noon", () => {
    const s = useRenderStore.getState();
    expect(s.mode).toBe("realistic");
    expect(s.quality).toBe("high");
    expect(s.timeOfDay).toBe("12:00");
  });

  it("pushes mode and weather into the Three.js runtime snapshot", () => {
    useRenderStore.getState().setMode("bim");
    expect(getRenderRuntime().mode).toBe("bim");
    useRenderStore.getState().setWeather("rain");
    expect(getRenderRuntime().weather).toBe("rain");
    expect(getRenderRuntime().wetness).toBeGreaterThan(0.5);
  });

  it("keeps camera presets independent of lighting", () => {
    useRenderStore.getState().setCameraPreset("street");
    expect(useRenderStore.getState().cameraPreset).toBe("street");
    expect(useRenderStore.getState().mode).toBe("realistic");
  });
});
