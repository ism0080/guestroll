// @refresh reload
import { mount, StartClient } from "@solidjs/start/client";
import { setupUploadQueue } from "./lib/uploadQueue";

mount(() => <StartClient />, document.getElementById("app")!);

setupUploadQueue();