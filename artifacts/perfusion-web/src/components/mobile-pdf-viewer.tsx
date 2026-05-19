import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

interface MobilePdfViewerProps {
  url: string;
  onError?: () => void;
  maxHeight?: number;
  className?: string;
  testId?: string;
}

export function MobilePdfViewer({
  url,
  onError,
  maxHeight,
  className,
  testId,
}: MobilePdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [width, setWidth] = useState<number>(0);

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setWidth(containerRef.current.clientWidth);
      }
    };
    update();
    window.addEventListener("resize", update);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && containerRef.current) {
      ro = new ResizeObserver(update);
      ro.observe(containerRef.current);
    }
    return () => {
      window.removeEventListener("resize", update);
      ro?.disconnect();
    };
  }, []);

  const style = maxHeight ? { maxHeight } : undefined;

  return (
    <div
      ref={containerRef}
      className={
        className ?? "w-full rounded border bg-white overflow-auto touch-pan-y"
      }
      style={style}
      data-testid={testId}
    >
      <Document
        file={url}
        onLoadSuccess={({ numPages: n }) => setNumPages(n)}
        onLoadError={() => onError?.()}
        loading={
          <div
            className="w-full bg-muted/30 animate-pulse"
            style={{ height: maxHeight ?? 380 }}
          />
        }
        error={
          <div className="p-4 text-sm text-muted-foreground">
            Failed to load PDF.
          </div>
        }
      >
        {numPages !== null &&
          width > 0 &&
          Array.from({ length: numPages }, (_, i) => (
            <div
              key={i}
              className="border-b last:border-b-0 flex justify-center bg-white"
            >
              <Page
                pageNumber={i + 1}
                width={width}
                renderAnnotationLayer={false}
                renderTextLayer={false}
                loading={
                  <div
                    className="w-full bg-muted/20 animate-pulse"
                    style={{ height: 400 }}
                  />
                }
              />
            </div>
          ))}
      </Document>
    </div>
  );
}
