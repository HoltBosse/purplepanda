import crypto from "node:crypto";

const SALT_LENGTH = 16;
const KEY_LENGTH = 64;
// Memory required: 128 * N * r = 128MB; maxmem must be set explicitly (Node default is 32MB)
const SCRYPT_PARAMS = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

// PHC string format: $scrypt$ln=16,r=8,p=1$<base64url-salt>$<base64url-hash>
// The algorithm and parameters are embedded so verify() can re-derive them
// and future algorithm upgrades (e.g. argon2id) can be added without breaking
// existing hashes.

export async function hash(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const { N, r, p, maxmem } = SCRYPT_PARAMS;
  const ln = Math.log2(N);
  const key = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LENGTH, { N, r, p, maxmem }, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
  // => $scrypt$ln=16,r=8,p=1$<salt>$<hash>
  return `$scrypt$ln=${ln},r=${r},p=${p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verify(password: string, hash: string): Promise<boolean> {
  const parts = hash.split("$");
  // ["", algo, params, salt, hash]
  if (parts.length !== 5 || parts[0] !== "") return false;

  const [, algo, rawParams, rawSalt, rawKey] = parts as [string, string, string, string, string];
  if (algo !== "scrypt") return false;

  const paramMap = Object.fromEntries(
    rawParams.split(",").map((kv) => kv.split("=") as [string, string])
  );
  const ln = parseInt(paramMap.ln ?? "", 10);
  const r = parseInt(paramMap.r ?? "", 10);
  const p = parseInt(paramMap.p ?? "", 10);
  if (isNaN(ln) || isNaN(r) || isNaN(p)) return false;

  const salt = Buffer.from(rawSalt, "base64url");
  const storedKey = Buffer.from(rawKey, "base64url");
  const N = Math.pow(2, ln);
  // maxmem must accommodate 128 * N * r bytes
  const maxmem = 128 * N * r * 2;

  const key = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, storedKey.length, { N, r, p, maxmem }, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
  return crypto.timingSafeEqual(storedKey, key);
}
