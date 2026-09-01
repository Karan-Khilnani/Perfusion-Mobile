import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type ConsultantAvatarProps = {
  name: string;
  photoUrl?: string | null;
  className: string;
  fallbackClassName?: string;
  "data-testid"?: string;
};

export default function ConsultantAvatar({
  name,
  photoUrl,
  className,
  fallbackClassName,
  "data-testid": dataTestId,
}: ConsultantAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = useMemo(
    () =>
      name
        .split(" ")
        .map((word) => word[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    [name],
  );

  useEffect(() => {
    setImageFailed(false);
  }, [photoUrl]);

  if (!photoUrl || imageFailed) {
    return (
      <div
        className={cn(
          "rounded-full bg-muted flex items-center justify-center text-muted-foreground font-medium shrink-0",
          className,
          fallbackClassName,
        )}
        aria-label={`${name} profile photo unavailable`}
        data-testid={dataTestId}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={photoUrl}
      alt={name}
      className={cn("rounded-full object-cover border shrink-0", className)}
      onError={() => setImageFailed(true)}
      data-testid={dataTestId}
    />
  );
}