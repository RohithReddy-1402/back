
import { Client, Storage, ID } from "node-appwrite";


const client = new Client()
    .setEndpoint("https://cloud.appwrite.io/v1")
    .setProject("68a567d00002634f3687")
    .setKey("standard_71261f49794f98e9ea46e2275112a7c7c8371eb0feddaa352b41a6baac0172422bd1ebae10cf5106ed2783725ee188a9dab6589fe9c8c181631b4a8c3496ac338cd23eebb7899da5bb70a7a8bd5d62ff47a0b264bcbcf633e5797c54e6b4ca52bb426f4ca88c16c5fc52f02d544ae14f56a415b1ccec652d6e7fb5865c26e93a"); 

const storageAW = new Storage(client);

export {storageAW,ID};
