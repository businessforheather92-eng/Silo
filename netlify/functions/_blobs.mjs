// Shared Netlify Blobs store getter for the Silo functions.
//
// getStore(name) is supposed to auto-detect siteID/token when called from
// inside a Netlify Function — but that automatic injection doesn't reliably
// reach plain Lambda-style handlers on every deploy path, and fails with
// MissingBlobsEnvironmentError when it doesn't. BLOBS_SITE_ID/BLOBS_TOKEN
// are the documented manual fallback (a Netlify personal access token) —
// set as env vars so this keeps working regardless of which injection path
// actually fires.
import { getStore } from "@netlify/blobs";

export function usersStore() {
  const siteID = process.env.BLOBS_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  return siteID && token ? getStore("silo-users", { siteID, token }) : getStore("silo-users");
}
