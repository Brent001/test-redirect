import express from "express";
import fetch from "node-fetch";

const app = express();

app.get("/redirect", async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl || !targetUrl.startsWith("http")) {
    return res.status(400).send("Invalid URL");
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "Referer": "https://megacloud.tv",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "*/*",
      },
    });

    res.setHeader("Content-Type", response.headers.get("content-type"));
    response.status(response.status);

    response.body.pipe(res);
  } catch (error) {
    res.status(500).send("Proxy error: " + error.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
