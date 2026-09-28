// Prefills an upload's title/alt from its file name: "my-photo_2 (1).jpg" -> "my photo 2".
export const toDefaultImageText = (filename: string) => {
    const withoutExtension = filename.replace(/\.[^/.]+$/, "");
    return withoutExtension
        .replace(/[-_]+/g, " ")
        .replace(/\s*\(\d+\)$/g, "")
        .replace(/\s+/g, " ")
        .trim();
};
