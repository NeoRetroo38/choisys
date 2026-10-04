import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "scenarys-api"
  });
});

const PORT = 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(Scenarys API running on http://0.0.0.0:);
});
