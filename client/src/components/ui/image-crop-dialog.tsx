import { useState, useRef, useCallback, useEffect } from "react";
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { Slider } from "@/components/ui/slider";

interface ImageCropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageFile: File | null;
  onCropComplete: (blob: Blob, filename: string) => void;
  aspect?: number;
  title?: string;
}

function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 80 }, aspect, mediaWidth, mediaHeight),
    mediaWidth,
    mediaHeight
  );
}

export function ImageCropDialog({
  open,
  onOpenChange,
  imageFile,
  onCropComplete,
  aspect,
  title = "Crop Image",
}: ImageCropDialogProps) {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [imgSrc, setImgSrc] = useState<string>("");
  const [scale, setScale] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (open && imageFile) {
      const reader = new FileReader();
      reader.onload = (e) => setImgSrc(e.target?.result as string);
      reader.readAsDataURL(imageFile);
    }
  }, [open, imageFile]);

  useEffect(() => {
    if (!open) {
      setImgSrc("");
      setCrop(undefined);
      setCompletedCrop(undefined);
      setScale(1);
    }
  }, [open]);

  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { naturalWidth: width, naturalHeight: height } = e.currentTarget;
      if (aspect) {
        setCrop(centerAspectCrop(width, height, aspect));
      } else {
        setCrop({ unit: "%", width: 90, height: 90, x: 5, y: 5 });
      }
    },
    [aspect]
  );

  const handleConfirm = async () => {
    if (!imgRef.current || !completedCrop || !imageFile) return;

    setIsProcessing(true);
    try {
      const canvas = document.createElement("canvas");
      const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
      const scaleY = imgRef.current.naturalHeight / imgRef.current.height;

      canvas.width = completedCrop.width * scaleX;
      canvas.height = completedCrop.height * scaleY;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(
        imgRef.current,
        completedCrop.x * scaleX,
        completedCrop.y * scaleY,
        completedCrop.width * scaleX,
        completedCrop.height * scaleY,
        0,
        0,
        canvas.width,
        canvas.height
      );

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const ext = imageFile.name.split(".").pop() || "png";
            const filename = `${imageFile.name.replace(/\.[^/.]+$/, "")}-cropped.${ext}`;
            onCropComplete(blob, filename);
            onOpenChange(false);
          }
          setIsProcessing(false);
        },
        "image/png",
        0.95
      );
    } catch {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    if (!imgRef.current) return;
    const { naturalWidth: width, naturalHeight: height } = imgRef.current;
    if (aspect) {
      setCrop(centerAspectCrop(width, height, aspect));
    } else {
      setCrop({ unit: "%", width: 90, height: 90, x: 5, y: 5 });
    }
    setScale(1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4 min-h-0">
          {imgSrc && (
            <>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ZoomOut className="h-4 w-4" />
                  <Slider
                    min={0.5}
                    max={3}
                    step={0.05}
                    value={[scale]}
                    onValueChange={([v]) => setScale(v)}
                    className="flex-1"
                    data-testid="slider-zoom"
                  />
                  <ZoomIn className="h-4 w-4" />
                  <span className="text-xs w-10">{Math.round(scale * 100)}%</span>
                </div>
              </div>

              <div
                className="flex justify-center overflow-auto max-h-[50vh] rounded-md border bg-muted/30"
                style={{ userSelect: "none" }}
              >
                <ReactCrop
                  crop={crop}
                  onChange={(c) => setCrop(c)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={aspect}
                  minWidth={40}
                  minHeight={40}
                >
                  <img
                    ref={imgRef}
                    src={imgSrc}
                    alt="Crop preview"
                    onLoad={handleImageLoad}
                    style={{ transform: `scale(${scale})`, transformOrigin: "top center", maxWidth: "100%", maxHeight: "500px" }}
                    data-testid="img-crop-preview"
                  />
                </ReactCrop>
              </div>
            </>
          )}

          {!imgSrc && (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={!imgSrc}
            data-testid="button-crop-reset"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="button-crop-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!completedCrop || isProcessing}
              data-testid="button-crop-confirm"
            >
              {isProcessing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Processing...</> : "Apply Crop"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
