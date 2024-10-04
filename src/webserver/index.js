const express = require("express");
const cors = require("cors");
const axios = require("axios");
const multer = require("multer");
const FormData = require("form-data");

const app = express();
const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } });
const PORT = 3000;
let Pending = 0;

app.use(cors({ origin: true, credentials: true }));

async function AwaitUpload(req, res, Path, Retry) {
  if (Retry) await new Promise(resolve => setTimeout(resolve, 250));

  axios({
    method: "get",
    url: `https://apis.roblox.com/assets/v1/${Path}`,
    headers: { "x-api-key": req.headers["x-api-key"] }
  }).then(response => {
    if (!response.data.done) return AwaitUpload(req, res, Path, true);

    Pending -= 1;
    res.json(response.data);
  }).catch(e => {
    Pending -= 1;
    console.error("Error in AwaitUpload:", e);
    res.sendStatus(500);
  });
}

app.options("/FigmaToRobloxProxy", cors());

app.post("/FigmaToRobloxProxy", upload.fields([
  { name: "request", maxCount: 1 },
  { name: "fileContent", maxCount: 1 }
]), async (req, res) => {
  if (!req.body.request || !req.files || !req.files.fileContent || !req.files.fileContent[0]) {
    console.error("Bad request:", req.body, req.files);
    return res.sendStatus(400);
  }

  Pending += 1;
  const File = req.files.fileContent[0];

  const NewBody = new FormData();
  NewBody.append("request", req.body.request);
  NewBody.append("fileContent", File.buffer, File.originalname);

  axios({
    method: "post",
    url: "https://apis.roblox.com/assets/v1/assets",
    data: NewBody,
    headers: {
      "x-api-key": req.headers["x-api-key"],
      ...NewBody.getHeaders()
    }
  }).then(response => {
    if (response.status !== 200) {
      Pending -= 1;
      console.error("Non-200 status code from Roblox API:", response.status, response.data);
      return res.sendStatus(response.status);
    }

    AwaitUpload(req, res, response.data.path);
  }).catch(e => {
    Pending -= 1;
    console.error("Error in POST /FigmaToRobloxProxy:", e);
    res.sendStatus(500);
  });
});

app.get("/FigmaToRobloxProxy", (req, res) => {
  res.json({ status: "ok", pending: Pending });
});

app.listen(PORT, () => {
  console.log(`Proxy Server started on port ${PORT}`);
  console.log(`Enter the following in the Figma plugin: http://localhost:${PORT}/FigmaToRobloxProxy`);
});