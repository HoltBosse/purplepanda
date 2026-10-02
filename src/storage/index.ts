import "dotenv/config";
import { S3Client } from "@aws-sdk/client-s3";
import { AwsS3StorageAdapter } from "@flystorage/aws-s3";
import { FileStorage } from "@flystorage/file-storage";
import { InMemoryStorageAdapter } from "@flystorage/in-memory";
import { LocalStorageAdapter } from "@flystorage/local-fs";
import { getDocumentPath } from "../document/document.js";
import { getMediaPath } from "../media/media.js";

// Uploaded media and documents both go through flystorage, so where they actually live is a
// deployment choice made with STORAGE_DRIVER rather than something every route has to know about:
//
// - "filesystem" (the default): MEDIA_PATH / DOCUMENT_PATH on local disk, as before.
// - "s3": an S3-compatible bucket (RustFS, MinIO, AWS...). Media and documents share the bucket
//   under the `media/` and `documents/` prefixes (after S3_PREFIX, if set).
// - "memory": process memory. Gone on restart and not shared between PM2 workers -- only for
//   tests and throwaway demos, which is why it shouts on startup (see logStorageBanner()).
export const STORAGE_DRIVERS = ["filesystem", "s3", "memory"] as const;
export type StorageDriver = (typeof STORAGE_DRIVERS)[number];

export function getStorageDriver(): StorageDriver {
  const driver = (process.env.STORAGE_DRIVER ?? "").trim().toLowerCase() || "filesystem";
  if (!(STORAGE_DRIVERS as readonly string[]).includes(driver)) {
    throw new Error(`Unknown STORAGE_DRIVER "${process.env.STORAGE_DRIVER}", expected one of: ${STORAGE_DRIVERS.join(", ")}`);
  }
  return driver as StorageDriver;
}

// Every stored file is keyed by its row's uuid, split into two levels of the id's own characters
// (cc/cc/cccc-cc...) and kept extension-less -- the format is sniffed from content when served.
// Nothing about the key is user-influenced. The same layout is used on every driver, so moving a
// filesystem deployment onto a bucket is a plain copy of the directory tree.
export function storageKey(id: string): string {
  return `${id.slice(0, 2)}/${id.slice(2, 4)}/${id}`;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`STORAGE_DRIVER=s3 requires ${name} to be set`);
  return value;
}

function getS3Prefix(): string {
  return (process.env.S3_PREFIX ?? "").replace(/^\/+|\/+$/g, "");
}

function s3Storage(client: S3Client, bucket: string, prefix: string): FileStorage {
  const base = getS3Prefix();
  return new FileStorage(new AwsS3StorageAdapter(client, { bucket, prefix: base ? `${base}/${prefix}` : prefix }));
}

type Stores = { driver: StorageDriver; media: FileStorage; documents: FileStorage };
let stores: Stores | undefined;

function createStores(): Stores {
  const driver = getStorageDriver();

  if (driver === "memory") {
    return {
      driver,
      media: new FileStorage(new InMemoryStorageAdapter()),
      documents: new FileStorage(new InMemoryStorageAdapter()),
    };
  }

  if (driver === "s3") {
    const bucket = requireEnv("S3_BUCKET");
    const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
    const client = new S3Client({
      region: process.env.S3_REGION?.trim() || "us-east-1",
      ...(process.env.S3_ENDPOINT?.trim() ? { endpoint: process.env.S3_ENDPOINT.trim() } : {}),
      // RustFS (like most self-hosted S3) serves buckets at /bucket rather than bucket.host, so
      // path-style is the default; set S3_FORCE_PATH_STYLE=false for virtual-hosted endpoints.
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE?.trim().toLowerCase() !== "false",
      // Without explicit keys the SDK's default chain (AWS_* env vars, instance roles...) applies.
      ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    });
    return {
      driver,
      media: s3Storage(client, bucket, "media"),
      documents: s3Storage(client, bucket, "documents"),
    };
  }

  return {
    driver,
    media: new FileStorage(new LocalStorageAdapter(getMediaPath())),
    documents: new FileStorage(new LocalStorageAdapter(getDocumentPath())),
  };
}

// Built once per process: the in-memory driver only works if every caller shares the same
// instances, and the S3 client is worth reusing anyway.
function getStores(): Stores {
  stores ??= createStores();
  return stores;
}

export function getMediaStorage(): FileStorage {
  return getStores().media;
}

export function getDocumentStorage(): FileStorage {
  return getStores().documents;
}

// For tests that switch STORAGE_DRIVER / paths between cases.
export function resetStorage(): void {
  stores = undefined;
}

function describeStorage(driver: StorageDriver): string {
  if (driver === "s3") {
    const endpoint = process.env.S3_ENDPOINT?.trim() || "AWS";
    const prefix = getS3Prefix();
    return `s3 (${endpoint}, bucket "${process.env.S3_BUCKET}"${prefix ? `, prefix "${prefix}/"` : ""})`;
  }
  if (driver === "memory") return "memory";
  return `filesystem (media: ${getMediaPath()}, documents: ${getDocumentPath()})`;
}

// Called once at server startup (see the storage integration in astro.config.ts). Building the
// stores here also means a misconfigured driver (unknown name, missing S3_BUCKET) fails the boot
// rather than the first upload.
export function logStorageBanner(): void {
  const { driver } = getStores();

  if (driver !== "memory") {
    console.info(`[storage] Using ${describeStorage(driver)}`);
    return;
  }

  const lines = [
    "STORAGE_DRIVER=memory: UPLOADS ARE KEPT IN MEMORY ONLY",
    "",
    "Every uploaded image and document is LOST when this process",
    "stops or restarts. Each PM2 worker also has its own copy, so",
    "a file uploaded on one worker 404s on the others.",
    "",
    "Do not use this in production. Unset STORAGE_DRIVER for the",
    "filesystem, or set STORAGE_DRIVER=s3 for object storage.",
  ];
  const width = Math.max(...lines.map((line) => line.length));
  const border = "!".repeat(width + 8);
  console.warn(
    [
      "",
      border,
      border,
      ...lines.map((line) => `!!! ${line.padEnd(width)} !!!`),
      border,
      border,
      "",
    ].join("\n"),
  );
}
