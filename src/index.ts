import express, { json } from "express";
import OpenAI from "openai";
import { config } from "dotenv";
import { log } from "console";

config();

const app = express();
const port = 3000;

const openai = new OpenAI();
const assistantId = process.env.OPENAI_ASSISTANT_ID;
console.log("assistantId", assistantId);

app.use(json());
app.use((req, res, next) => {
  // res.header("Access-Control-Allow-Origin", "http://127.0.0.1:5173"); // 특정 도메인 허용
  res.header("Access-Control-Allow-Origin", "*"); // 특정 도메인 허용
  res.setHeader(
    "Access-Control-Allow-Methods",
    "OPTIONS, GET, POST, PUT, DELETE"
  );
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  next();
});

app.post("/api/assistants/threads", async (req, res) => {
  try {
    console.log("create thread");
    const thread = await openai.beta.threads.create();
    console.log(thread);
    res.json({
      result: 200,
      thread,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

const eventRes: Record<string, any> = {};

app.get("/api/assistants/:threadId/messages", async (req, res) => {
  try {
    const threadId = req.params.threadId;
    const messages = await openai.beta.threads.messages.list(threadId);
    res.json({
      result: 200,
      threadId: threadId,
      messages,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

app.get("/api/assistants/:threadId/events", async (req, res) => {
  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const threadId = req.params.threadId;
    const { sid } = req.query;
    console.log("threadId", threadId);
    console.log("sid", sid);

    eventRes[`${sid}_${threadId}`] = res;
    req.on("close", () => {
      console.log("close eventRes", `${sid}_${threadId}`);
      res.end();

      delete eventRes[`${sid}_${threadId}`];
    });
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

app.post("/api/assistants/:threadId/messages", async (req, res) => {
  console.log("post message");
  const threadId = req.params.threadId;
  const content = req.body.content;
  const sid = req.body.sid;
  const resKey = `${sid}_${threadId}`;

  console.log("sid", sid);
  console.log("content", content);
  try {
    const message = await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: content,
    });

    const run = openai.beta.threads.runs
      .stream(threadId, {
        assistant_id: assistantId,
      })
      .on("textCreated", (text) => {
        try {
          console.log("textCreated:", JSON.stringify(text));

          eventRes[resKey].write(
            `data: ${JSON.stringify({
              type: "textCreated",
              text,
            })}\n\n`
          );
        } catch (e) {
          console.error(e);
        }
      })
      .on("messageDone", (message) => {
        console.log("messageDone:", JSON.stringify(message));
      })
      .on("runStepCreated", (runStep) => {
        console.log("runStepCreated:", JSON.stringify(runStep));
      })
      .on("runStepDelta", (delta, snapshot) => {
        console.log("runStepDelta:", JSON.stringify(delta));
      })
      .on("runStepDone", (runStep, snapshot) => {
        console.log("runStepDone:", JSON.stringify(runStep));
      })
      .on("textDelta", (textDelta, snapshot) => {
        try {
          if (!textDelta.value) return;
          eventRes[resKey].write(
            `data: ${JSON.stringify({ type: "textDelta", textDelta })}\n\n`
          );
        } catch (e) {
          console.error(e);
        }
      })
      .on("end", async () => {
        console.log("end event");
      });

    res.json({
      result: 200,
      message,
      run,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
