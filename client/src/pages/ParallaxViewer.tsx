import { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import { Layers, Upload, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const DEFAULT_COLORS = [
  "#1a1a2e", // dark navy - background layer
  "#16213e", // deep blue - mid layer
  "#0f3460", // royal blue - front layer
];

function createColorTexture(color: string): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 360);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "#000000");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  // Add subtle pattern
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  for (let i = 0; i < 20; i++) {
    ctx.beginPath();
    ctx.arc(
      Math.random() * 512,
      Math.random() * 512,
      Math.random() * 60 + 10,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

interface LayerConfig {
  url: string | null;
  z: number;
  scale: number;
  depthFactor: number;
}

const LAYER_CONFIGS: LayerConfig[] = [
  { url: null, z: -1.5, scale: 6.5, depthFactor: 0.25 },
  { url: null, z: 0,    scale: 6.0, depthFactor: 0.5 },
  { url: null, z: 1.5,  scale: 5.5, depthFactor: 0.75 },
];

export default function ParallaxViewer() {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    meshes: THREE.Mesh[];
    animId: number;
    mouseX: number;
    mouseY: number;
    targetX: number;
    targetY: number;
  } | null>(null);

  const [photoUrls, setPhotoUrls] = useState<(string | null)[]>([null, null, null]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);
  const fileInputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  const initScene = useCallback(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Cleanup previous
    if (sceneRef.current) {
      sceneRef.current.renderer.dispose();
      cancelAnimationFrame(sceneRef.current.animId);
      mount.innerHTML = "";
    }

    const w = mount.clientWidth;
    const h = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
    camera.position.z = 7;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const loader = new THREE.TextureLoader();
    const meshes: THREE.Mesh[] = [];

    LAYER_CONFIGS.forEach((cfg, i) => {
      const geo = new THREE.PlaneGeometry(cfg.scale, cfg.scale * (h / w));
      const tex = photoUrls[i]
        ? loader.load(photoUrls[i]!)
        : createColorTexture(DEFAULT_COLORS[i]);

      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.z = cfg.z;
      scene.add(mesh);
      meshes.push(mesh);
    });

    const state = {
      renderer,
      scene,
      camera,
      meshes,
      animId: 0,
      mouseX: 0,
      mouseY: 0,
      targetX: 0,
      targetY: 0,
    };
    sceneRef.current = state;

    const animate = () => {
      state.animId = requestAnimationFrame(animate);
      state.mouseX += (state.targetX - state.mouseX) * 0.08;
      state.mouseY += (state.targetY - state.mouseY) * 0.08;

      meshes.forEach((mesh, i) => {
        const d = LAYER_CONFIGS[i].depthFactor;
        mesh.rotation.y += (state.mouseX * 0.3 * d - mesh.rotation.y) * 0.05;
        mesh.rotation.x += (-state.mouseY * 0.3 * d - mesh.rotation.x) * 0.05;
        mesh.position.x += (state.mouseX * d * 0.8 - mesh.position.x) * 0.04;
        mesh.position.y += (-state.mouseY * d * 0.8 - mesh.position.y) * 0.04;
      });

      renderer.render(scene, camera);
    };
    animate();
  }, [photoUrls]);

  useEffect(() => {
    initScene();
    return () => {
      if (sceneRef.current) {
        cancelAnimationFrame(sceneRef.current.animId);
        sceneRef.current.renderer.dispose();
      }
    };
  }, [initScene]);

  useEffect(() => {
    const handleMouse = (e: MouseEvent) => {
      if (!sceneRef.current) return;
      sceneRef.current.targetX = (e.clientX / window.innerWidth - 0.5) * 2;
      sceneRef.current.targetY = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    const handleTouch = (e: TouchEvent) => {
      if (!sceneRef.current || !e.touches[0]) return;
      sceneRef.current.targetX = (e.touches[0].clientX / window.innerWidth - 0.5) * 2;
      sceneRef.current.targetY = (e.touches[0].clientY / window.innerHeight - 0.5) * 2;
    };
    const handleResize = () => {
      const s = sceneRef.current;
      const mount = mountRef.current;
      if (!s || !mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      s.camera.aspect = w / h;
      s.camera.updateProjectionMatrix();
      s.renderer.setSize(w, h);
    };

    window.addEventListener("mousemove", handleMouse);
    window.addEventListener("touchmove", handleTouch, { passive: true });
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("mousemove", handleMouse);
      window.removeEventListener("touchmove", handleTouch);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const handleFileChange = (index: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPhotoUrls(prev => {
      const next = [...prev];
      next[index] = url;
      return next;
    });
  };

  const clearPhoto = (index: number) => {
    setPhotoUrls(prev => {
      const next = [...prev];
      if (next[index]) URL.revokeObjectURL(next[index]!);
      next[index] = null;
      return next;
    });
    if (fileInputRefs[index].current) fileInputRefs[index].current!.value = "";
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      viewerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const LAYER_LABELS = ["배경 레이어 (뒤)", "중간 레이어", "전경 레이어 (앞)"];

  return (
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6 md:space-y-8">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="bg-purple-100 p-2 sm:p-2.5 md:p-3 rounded-lg sm:rounded-xl text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
          <Layers className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8" />
        </div>
        <div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-foreground">
            3D 패럴랙스 뷰어
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            마우스 또는 손가락으로 움직여보세요
          </p>
        </div>
      </div>

      {/* Viewer */}
      <div
        ref={viewerRef}
        className={`relative rounded-2xl overflow-hidden bg-black cursor-crosshair ${
          isFullscreen ? "fixed inset-0 z-50 rounded-none" : "aspect-video"
        }`}
      >
        <div ref={mountRef} className="w-full h-full" />

        <div className="absolute top-3 left-3 bg-black/50 backdrop-blur-sm text-white/70 text-xs px-3 py-1.5 rounded-full select-none">
          마우스 또는 손가락으로 움직여보세요
        </div>

        <button
          onClick={toggleFullscreen}
          className="absolute top-3 right-3 bg-black/50 backdrop-blur-sm text-white/70 hover:text-white px-3 py-1.5 rounded-full text-xs transition-colors"
        >
          {isFullscreen ? "축소" : "전체화면"}
        </button>
      </div>

      {/* Photo Upload */}
      <Card className="border-purple-200 dark:border-purple-900/30">
        <CardHeader className="bg-purple-50/50 dark:bg-purple-900/10 border-b p-3 sm:p-4 md:p-6">
          <CardTitle className="text-sm sm:text-base md:text-lg flex items-center gap-2">
            <Upload className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
            레이어 사진 설정
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 md:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {LAYER_LABELS.map((label, i) => (
              <div key={i} className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">{label}</p>
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRefs[i]}
                  onChange={handleFileChange(i)}
                  className="hidden"
                />
                <div
                  onClick={() => fileInputRefs[i].current?.click()}
                  className="relative aspect-video rounded-lg overflow-hidden border-2 border-dashed border-purple-200 dark:border-purple-800 hover:border-purple-400 cursor-pointer transition-colors group"
                >
                  {photoUrls[i] ? (
                    <>
                      <img
                        src={photoUrls[i]!}
                        alt={label}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); clearPhoto(i); }}
                        className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-red-600 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <div
                      className="w-full h-full flex flex-col items-center justify-center gap-1 text-purple-400 group-hover:text-purple-500 transition-colors"
                      style={{ background: DEFAULT_COLORS[i] }}
                    >
                      <Upload className="w-6 h-6 opacity-70" />
                      <span className="text-xs opacity-70">클릭하여 업로드</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="mt-4 gap-2 text-purple-600 border-purple-300 hover:bg-purple-50"
            onClick={() => {
              photoUrls.forEach(url => { if (url) URL.revokeObjectURL(url); });
              setPhotoUrls([null, null, null]);
              fileInputRefs.forEach(ref => { if (ref.current) ref.current.value = ""; });
            }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            기본값으로 초기화
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
