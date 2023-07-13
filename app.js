var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");

var indexRouter = require("./routes/index");
var usersRouter = require("./routes/users");

const multer = require("multer");
const { exec } = require("child_process");
const upload = multer({ dest: "uploads/" });
var hbjs = require("handbrake-js");
var chalk = require("cli-color");
const { performance } = require("perf_hooks");

var app = express();

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use("/", indexRouter);
app.use("/users", usersRouter);

/**
 * @description To Transcode files concurrently , use the api /convertAsync
 */
app.post("/convertAsync", upload.array("video"), (req, res) => {
  if (!req.files.length) {
    return res.status(400).json({ error: "No video file uploaded" });
  }

  function encodeVideo(inputFilePath, outputFilePath) {
    return new Promise((resolve, reject) => {
      hbjs
        .spawn({
          input: inputFilePath,
          output: outputFilePath,
        })
        .on("error", (err) => {
          console.log("error ocurred . . .");
          reject(new Error(`Video encoding failed with code ${err}`));
        })
        .on("progress", (progress) => {
          if (progress.percentComplete == 100) {
            console.log("Transcoding done for file::", outputFilePath);
          } else {
            console.log(
              "Percent complete: %s, ETA: %s",
              progress.percentComplete,
              progress.eta
            );
          }
        })
        .on("complete", (progress) => {
          console.log("successfully transcoded to mp4");
          resolve();
        });
    });
  }

  // Function to encode multiple videos concurrently
  async function encodeMultipleVideos(videoPaths) {
    try {
      const encodingPromises = videoPaths.map((videoPath) => {
        // const outputFilePath = `${req.file.originalname}.encoded.mp4`;
        const outputFilePath = `output/${videoPath.originalname.replace(
          /\.[^/.]+$/,
          ""
        )}.mp4`;
        return encodeVideo(videoPath.path, outputFilePath);
      });

      await Promise.all(encodingPromises);
      console.log("All videos encoded successfully");
      return res.json({
        message: "successfully transcoded to mp4",
      });
    } catch (error) {
      console.error("Error encoding videos:", error);
    }
  }

  encodeMultipleVideos(req.files);
});

/**
 * @description To Transcode files sequentially , use the api /convertSync
 */
app.post("/convertSync", upload.array("video"), (req, res) => {
  if (!req.files.length) {
    return res.status(400).json({ error: "No video file uploaded" });
  }

  function encodeVideo(inputFilePath, outputFilePath) {
    return new Promise((resolve, reject) => {
      hbjs
        .spawn({
          input: inputFilePath,
          output: outputFilePath,
        })
        .on("error", (err) => {
          console.log("error ocurred . . .");
          reject(new Error(`Video encoding failed with code ${err}`));
        })
        .on("progress", (progress) => {
          if (progress.percentComplete == 100) {
            console.log("Transcoding done for file::", outputFilePath);
          } else {
            console.log(
              "Percent complete: %s, ETA: %s",
              progress.percentComplete,
              progress.eta
            );
          }
        })
        .on("complete", (progress) => {
          console.log("successfully transcoded to mp4");
          resolve();
        });
    });
  }

  // Recursive function to encode videos sequentially
  async function encodeVideosSequentially(videoPaths, currentIndex = 0) {
    console.log(videoPaths, "videoPaths", currentIndex);
    if (currentIndex >= videoPaths.length) {
      console.log("All videos encoded successfully");
      res.json({ status: "All videos encoded successfully" });
      return;
    }

    try {
      const videoPath = videoPaths[currentIndex];
      const outputFilePath = `output/${videoPath.originalname.replace(
        /\.[^/.]+$/,
        ""
      )}.mp4`;
      console.log(videoPath, outputFilePath, "555555");
      await encodeVideo(videoPath.path, outputFilePath);
      console.log(
        `Video number ${currentIndex + 1} with path ${
          videoPath.path
        } encoded successfully`
      );

      // Encode the next video
      await encodeVideosSequentially(videoPaths, currentIndex + 1);
    } catch (error) {
      console.error("Error encoding videos:", error);
    }
  }

  encodeVideosSequentially(req.files);
});

/**
 * @description To Transcode files Concurrently in batches , use the api /convertBatch
 * Batch size of videos transcodes concurrrently , once a batch is complete , the next batch starts , sequentially
 */
app.post("/convertBatch", upload.array("video"), (req, res) => {
  if (!req.files.length) {
    return res.status(400).json({ error: "No video file uploaded" });
  }

  function bytesToMB(bytes) {
    const megabytes = bytes / (1024 * 1024);
    return megabytes.toFixed(2);
  }

  function encodeVideo(inputFilePath, outputFilePath) {
    return new Promise((resolve, reject) => {
      hbjs
        .spawn({
          input: inputFilePath.path,
          output: outputFilePath,
        })
        .on("error", (err) => {
          console.log(chalk.red("error ocurred . . ."));
          reject(new Error(`Video encoding failed with code ${err}`));
        })
        .on("progress", (progress) => {
          if (progress.percentComplete == 100) {
            console.log(
              chalk.blue(
                "Transcoding done for",
                inputFilePath.originalname,
                "Processing, Please wait"
              )
            );
          } else {
            console.log(
              chalk.magenta(
                "Processing: ",
                chalk.bgYellowBright(progress.percentComplete),
                "ETA:",
                chalk.bgYellowBright(progress.eta),
                `for the file:${chalk.bgYellowBright(
                  inputFilePath.originalname
                )} with size:${chalk.bgYellowBright(inputFilePath.size)}`
              )
            );
          }
        })
        .on("complete", (progress) => {
          console.log(chalk.green("successfully transcoded to mp4"));
          resolve();
        });
    });
  }

  // Function to encode videos in batches
  async function encodeVideosInBatches(videoPaths, batchSize) {
    let currentIndex = 0;
    const startTime = performance.now(); // Start time of the program
    console.log(`Start Time: ${new Date(startTime).toLocaleString()}`);
    console.log(
      chalk.blueBright(
        "Total videos provided for transcoding:",
        chalk.bold(videoPaths.length),
        "And the batch size is :",
        chalk.bold(batchSize)
      )
    );
    while (currentIndex < videoPaths.length) {
      const currentBatch = videoPaths.slice(
        currentIndex,
        currentIndex + batchSize
      );

      try {
        const encodingPromises = currentBatch.map((videoPath) => {
          const outputFilePath = `output/${videoPath.originalname.replace(
            /\.[^/.]+$/,
            ""
          )}.mp4`;
          return encodeVideo(videoPath, outputFilePath);
        });

        await Promise.all(encodingPromises);
        console.log(
          chalk.greenBright(
            `Batch of ${currentBatch.length} videos transcoded successfully`
          )
        );
        currentIndex += batchSize;
      } catch (error) {
        console.error(chalk.red("Error transcoding videos:", error));
        res.json({ message: "Error transcoding videos:", error: error });
        break;
      }
    }
    const endTime = performance.now(); // End time of the program
    const duration = endTime - startTime; // Duration of the program in milliseconds
    const durationInMinutes = Math.floor(duration / 60000); // Duration in minutes
    const durationInHours = Math.floor(durationInMinutes / 60); // Duration in hours
    const remainingMinutes = durationInMinutes % 60; // Remaining minutes
    console.log(`End Time: ${new Date(endTime).toLocaleString()}`);

    console.log(chalk.greenBright("All videos encoded successfully"));
    console.log(
      chalk.bold(chalk.bgYellowBright(
        `Process took ${(
          durationInHours
        )}h${(remainingMinutes)}m`
      ))
    );

    res.json({
      message: "All videos encoded successfully",
      code: 200,
      details: `All Videos of count ${videoPaths.length} Transcoded successfully`,
      time: `Process took ${durationInHours}h${remainingMinutes}m`,
      startedAt: `Start Time: ${new Date(startTime).toLocaleString()}`,
      FinishedAt: `End Time: ${new Date(endTime).toLocaleString()}`
    });
  }
  const batchSize = 5;
  encodeVideosInBatches(req.files, batchSize);
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

module.exports = app;
