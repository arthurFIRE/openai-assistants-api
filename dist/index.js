"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importStar(require("express"));
const openai_1 = __importDefault(require("openai"));
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)();
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
const openai = new openai_1.default();
const assistantId = process.env.OPENAI_ASSISTANT_ID || "";
console.log("assistantId", assistantId);
app.use((0, express_1.json)());
app.use((req, res, next) => {
    // res.header("Access-Control-Allow-Origin", "http://127.0.0.1:5173"); // 특정 도메인 허용
    res.header("Access-Control-Allow-Origin", "*"); // 특정 도메인 허용
    res.setHeader("Access-Control-Allow-Methods", "OPTIONS, GET, POST, PUT, DELETE");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
});
app.get("/", (req, res) => res.send("Hello World!"));
app.post("/api/assistants/threads", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log("create thread");
        const thread = yield openai.beta.threads.create();
        console.log(thread);
        res.json({
            result: 200,
            thread,
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).send(error);
    }
}));
const eventRes = {};
app.get("/api/assistants/:threadId/messages", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const threadId = req.params.threadId;
        const messages = yield openai.beta.threads.messages.list(threadId);
        res.json({
            result: 200,
            threadId: threadId,
            messages,
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).send(error);
    }
}));
app.get("/api/assistants/:threadId/events", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
    }
    catch (error) {
        console.error(error);
        res.status(500).send(error);
    }
}));
app.post("/api/assistants/:threadId/messages", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("post message");
    const threadId = req.params.threadId;
    const content = req.body.content;
    const sid = req.body.sid;
    const resKey = `${sid}_${threadId}`;
    console.log("sid", sid);
    console.log("content", content);
    try {
        const message = yield openai.beta.threads.messages.create(threadId, {
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
                eventRes[resKey].write(`data: ${JSON.stringify({
                    type: "textCreated",
                    text,
                })}\n\n`);
            }
            catch (e) {
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
                if (!textDelta.value)
                    return;
                eventRes[resKey].write(`data: ${JSON.stringify({ type: "textDelta", textDelta })}\n\n`);
            }
            catch (e) {
                console.error(e);
            }
        })
            .on("end", () => __awaiter(void 0, void 0, void 0, function* () {
            console.log("end event");
        }));
        res.json({
            result: 200,
            message,
            run,
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).send(error);
    }
}));
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
