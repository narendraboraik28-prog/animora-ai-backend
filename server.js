const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { GoogleGenAI } = require("@google/genai");

const app = express();

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.warn("WARNING: GEMINI_API_KEY is not configured.");
}

const ai = API_KEY
    ? new GoogleGenAI({ apiKey: API_KEY })
    : null;

app.use(cors());
app.use(express.json());

const upload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 10 * 1024 * 1024
    },

    fileFilter: (req, file, callback) => {
        if (!file.mimetype.startsWith("image/")) {
            return callback(
                new Error("Only image files are allowed.")
            );
        }

        callback(null, true);
    }
});


/* =========================
   HEALTH CHECK
   ========================= */

app.get("/", (req, res) => {
    res.json({
        success: true,
        service: "Animora AI",
        status: "online"
    });
});


/* =========================
   GENERATE VIDEO
   ========================= */

app.post(
    "/api/generate-video",
    upload.single("image"),
    async (req, res) => {

        try {

            if (!API_KEY || !ai) {
                return res.status(500).json({
                    success: false,
                    message:
                        "Gemini API key is not configured on the backend."
                });
            }

            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: "Please upload an image."
                });
            }

            const prompt =
                typeof req.body.prompt === "string"
                    ? req.body.prompt.trim()
                    : "";

            const finalPrompt =
                prompt ||
                "Animate this image naturally with cinematic camera movement, realistic motion, subtle environmental movement, and visually appealing details.";

            console.log("Starting Animora AI video generation...");


            /* =========================
               IMAGE → BASE64
               ========================= */

            const imageBase64 =
                req.file.buffer.toString("base64");


            /* =========================
               START VEO GENERATION
               ========================= */

            let operation =
                await ai.models.generateVideos({

                    model:
                        "veo-3.1-generate-preview",

                    prompt:
                        finalPrompt,

                    image: {
                        imageBytes:
                            imageBase64,

                        mimeType:
                            req.file.mimetype
                    },

                    config: {
                        aspectRatio: "16:9"
                    }
                });


            console.log(
                "Video generation started:",
                operation.name
            );


            /* =========================
               POLL OPERATION
               ========================= */

            let attempts = 0;
            const maxAttempts = 60;

            while (!operation.done) {

                attempts++;

                if (attempts > maxAttempts) {
                    throw new Error(
                        "Video generation timed out. Please try again."
                    );
                }

                console.log(
                    `Waiting for video... attempt ${attempts}`
                );

                await new Promise(
                    resolve =>
                        setTimeout(resolve, 10000)
                );

                operation =
                    await ai.operations.getVideosOperation({
                        operation
                    });
            }


            /* =========================
               CHECK RESULT
               ========================= */

            if (
                !operation.response ||
                !operation.response.generatedVideos ||
                !operation.response.generatedVideos.length
            ) {
                throw new Error(
                    "Video generation completed but no video was returned."
                );
            }


            const generatedVideo =
                operation.response.generatedVideos[0];

            const videoFile =
                generatedVideo.video;


            if (!videoFile) {
                throw new Error(
                    "Generated video file was not returned."
                );
            }


            /* =========================
               DOWNLOAD VIDEO DATA
               ========================= */

            const downloadedVideo =
                await ai.files.download({
                    file: videoFile,
                    downloadPath: undefined
                });


            let videoBuffer;


            if (Buffer.isBuffer(downloadedVideo)) {

                videoBuffer =
                    downloadedVideo;

            } else if (
                downloadedVideo &&
                downloadedVideo.buffer
            ) {

                videoBuffer =
                    downloadedVideo.buffer;

            } else {

                throw new Error(
                    "Unable to read generated video data."
                );
            }


            /* =========================
               SEND VIDEO TO FRONTEND
               ========================= */

            res.setHeader(
                "Content-Type",
                "video/mp4"
            );

            res.setHeader(
                "Content-Length",
                videoBuffer.length
            );

            res.setHeader(
                "Content-Disposition",
                'inline; filename="animora-ai-video.mp4"'
            );

            return res.send(videoBuffer);

        } catch (error) {

            console.error(
                "Animora video generation error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    error.message ||
                    "Video generation failed."
            });
        }
    }
);


/* =========================
   ERROR HANDLER
   ========================= */

app.use((error, req, res, next) => {

    console.error(error);

    if (error.code === "LIMIT_FILE_SIZE") {

        return res.status(400).json({
            success: false,
            message:
                "Image size must be 10 MB or smaller."
        });
    }

    return res.status(400).json({
        success: false,
        message:
            error.message ||
            "Invalid request."
    });
});


/* =========================
   START SERVER
   ========================= */

app.listen(PORT, () => {

    console.log(
        `Animora AI backend running on port ${PORT}`
    );

});
