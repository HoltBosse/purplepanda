import type { ComponentConfig } from "@puckeditor/core";
import { useEffect, useRef, useState } from "react";
import { type ImageConfig, imageField, imageSizeOverrideField, withCropParams } from "../component-fields/ImageField.js";

export type ImagePickerProps = {
  image: ImageConfig | null;
};

function ImageDisplay({ image, isEditing }: { image: ImageConfig; isEditing: boolean }) {
  const [loading, setLoading] = useState(true);
  const imgRef = useRef<HTMLImageElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: image.id isn't read in the body, it's an intentional re-trigger — this must re-run whenever the image identity changes, see the comment below
  useEffect(() => {
    // On a server-rendered page, the browser can finish loading this <img> (from the markup
    // it already parsed) before React hydrates and attaches the onLoad handler below, so that
    // real "load" event fires into the void and loading would otherwise never clear. Re-check
    // completeness directly whenever the image identity changes to catch that race.
    setLoading(!imgRef.current?.complete);
  }, [image.id]);

  const base = `/image/${image.id}`;
  const webpSrc = withCropParams(`${base}?fmt=webp`, image.crop);
  const pngSrc = withCropParams(`${base}?fmt=png`, image.crop);

  return (
    <div className="relative min-h-12">
      {(loading && isEditing) && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-base-200/50">
          <span className="loading loading-spinner loading-xl" />
        </div>
      )}
      <picture>
        <source srcSet={webpSrc} type="image/webp" />
        <source srcSet={pngSrc} type="image/png" />
        <img
          ref={imgRef}
          src={pngSrc}
          style={{
            objectFit: "cover",
            objectPosition: image.objectPosition ?? "50% 50%",
            width: image.width != null ? `${image.width}px` : "100%",
            height: image.height != null ? `${image.height}px` : "100%",
          }}
          alt={image.alt}
          title={image.title}
          onLoad={() => setLoading(false)}
        />
      </picture>
    </div>
  );
}

const ImagePicker: ComponentConfig<ImagePickerProps> = {
  label: "Image",
  bindableFields: {
    image: {
      label: "Image",
      fieldTypes: ["custom"],
      // The picture itself varies per item, but sizing is usually a design decision — let width
      // and height be pinned to one shared value (set with the same slider/checkbox control used
      // above) instead of varying with whatever size each item's own image happens to have.
      overridable: {
        label: "Size",
        keys: ["width", "height"],
        field: imageSizeOverrideField,
      },
    },
  },
  fields: {
    image: imageField,
  },
  defaultProps: {
    image: null,
  },
  render: ({ image, puck }) => {
    if (!image?.id) {
      return (
        <div className="rounded-lg border-2 border-dashed border-base-300 bg-base-200 p-6 text-center text-base-content/50">
          No image selected
        </div>
      );
    }

    return <ImageDisplay image={image} isEditing={puck.isEditing} />;
  },
};

export default ImagePicker;
