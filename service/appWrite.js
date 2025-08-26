
import dotenv from "dotenv";
dotenv.config();
import { Client, Storage, ID } from "appwrite";

const client = new Client()
  .setEndpoint("https://cloud.appwrite.io/v1") 
  .setProject(process.env.APPWRITE_PROJECT_ID); 

const storage = new Storage(client);
const bucketId = "68a5689f000a8af36f8a";
export async function uploadFile(file) {
  try {
    const response = await storage.createFile(bucketId, ID.unique(), file);
    return response;
  } catch (error) {
    console.error("Upload error:", error);
    throw error;
  }
}

export function getFileViewURL( fileId) {
  return storage.getFileView(bucketId, fileId).href;
}

export function getFileDownloadURL( fileId) {
  return storage.getFileDownload(bucketId, fileId).href;
}

export function getFilePreviewURL(fileId) {
  return storage.getFilePreview(bucketId, fileId).href;
}
