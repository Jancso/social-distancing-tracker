const cv = require('opencv4nodejs');
const path = require('path');
const child_process = require("child_process");
const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const nunjucks = require('nunjucks');
const fs = require('fs');

nunjucks.configure({
    autoescape: true,
    express: app
});

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.render('index.html');
});

const videos_dir = './videos/';
const temp_dir = './temp/';

if (!fs.existsSync(videos_dir)) {
    fs.mkdirSync(videos_dir);
}

if (!fs.existsSync(temp_dir)) {
    fs.mkdirSync(temp_dir);
}

app.get('/videos/', (req, res) => {
    let videos = [];

    fs.readdir(videos_dir, (err, files) => {
        files.forEach(file => {
            if (fs.lstatSync(path.join(videos_dir, file)).isFile()){
                const video = {};
                video.name = file;
                videos.push(video);
            }
        });

        res.render('videos.html', {'videos': videos});
    });
});


app.get('/videos/:videoId/', function (req, res) {
    const videoName = req.params['videoId'];
    const overview_json = path.join(videos_dir, path.parse(req.params['videoId']).name, 'overview.json');
    //console.log(overview_json);
    try {
        const rawData = fs.readFileSync(overview_json);
        const groups = JSON.parse(rawData);
        //console.log('Groups:', groups);
        const video = {'name': videoName, 'groups': groups};
        res.render('video.html', {'video': video});
    } catch(err) {
        console.error(err)
    }
});

// https://github.com/daspinola/video-stream-sample
app.get('/videos/:videoId/download/', function(req, res) {
    const videoPath = path.join(videos_dir, path.parse(req.params['videoId']).name, 'video.mp4');
    console.log(videoPath);
    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1]
            ? parseInt(parts[1], 10)
            : fileSize-1;

        if(start >= fileSize) {
            res.status(416).send('Requested range not satisfiable\n'+start+' >= '+fileSize);
            return
        }

        const chunksize = (end-start)+1;
        const file = fs.createReadStream(videoPath, {start, end});
        const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/mp4',
        };

        res.writeHead(206, head);
        file.pipe(res)
    } else {
        const head = {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4',
        };
        res.writeHead(200, head);
        fs.createReadStream(videoPath).pipe(res)
    }
});


app.get('/webcam/', (req, res) => {
    res.render('webcam.html');
});

let runWebcam = null;
let wCap = null;

// start the webcam
app.get('/webcam/start/', (req, res) => {
    // frames per second
    const FPS = 10;
    wCap = new cv.VideoCapture(0);

    runWebcam = setInterval(() => {
        const frame = wCap.read();
        const image = cv.imencode('.jpg', frame).toString('base64');
        io.emit('image', image);
    }, 1000 / FPS);

    res.sendStatus(200);

});


// stop the webcam
app.get('/webcam/stop/', () => {
    clearInterval(runWebcam);
    wCap.release();
    console.log('Webcam stopped!');
});

files = {};

io.sockets.on('connection', function (socket) {

    const blockSize = 524288;
    const bufferSize = 10485760;

    socket.on('startUpload', function (data) {
        const fileName = data.fileName;

        files[fileName] = {
            fd: null,
            size: data.fileSize,
            buffer: "",
            bytesUploaded: 0
        };

        // where the file will be stored temporarily
        const filePath = temp_dir + fileName;

        // at which position in the video the upload should continue
        let blockPosition = 0;

        // check if file has already been partially uploaded
        if (fs.existsSync(filePath)) {
            const Stat = fs.statSync(filePath);
            if (Stat.isFile()) {
                files[fileName].bytesUploaded = Stat.size;
                blockPosition = Stat.size / blockSize;
            }
        }

        // open file for appending and request more data from the client
        fs.open(filePath, "a", 0o755, function (err, fd) {
            if (err) {
                console.log(err);
            } else {
                files[fileName].fd = fd;
                socket.emit('uploadMore', {blockPosition: blockPosition, percentUploaded: 0});
            }
        });
    });


    socket.on('continueUpload', function (data) {
        const fileName = data.fileName;
        const file = files[fileName];
        file.bytesUploaded += data.fileData.length;
        file.buffer += data.fileData;

        // check if upload is finished
        if (file.bytesUploaded === file.size) {
            // write remaining buffered data to the file
            fs.write(file.fd, file.buffer, null, 'Binary', function () {
                // move video from temporary folder to video folder
                fs.rename(temp_dir + fileName, videos_dir + fileName, (err) => {
                    if (err) throw err;
                    socket.emit('uploadFinished');

                    // run people detection script
                    const abs_videos_dir = path.resolve(videos_dir);
                    const video_path = path.join(abs_videos_dir, fileName);
                    let cmd = `../venv/bin/python ../people_detection/group_detection.py ${video_path} -o ${abs_videos_dir}`;

                    child_process.exec(cmd, (err, stdout) => {
                        if (err) {
                            console.error(err);
                        } else {
                            console.log(stdout);
                            console.log(`file ${fileName} analyzed!`);

                            const output_video_dirname = path.parse(fileName).name
                            const output_video_path = path.join(abs_videos_dir, output_video_dirname ,'output_video.mp4');
                            const converted_video_path = path.join(abs_videos_dir, output_video_dirname, 'video.mp4');
                            const convert_cmd = `ffmpeg -y -i ${output_video_path} -c:v libx264 -pix_fmt yuv420p ${converted_video_path}`;

                            child_process.exec(convert_cmd, () => {
                                if (err) {
                                    console.error(err);
                                } else {
                                    console.log(stdout);
                                    console.log(`file ${output_video_path} converted!`);
                                    socket.emit('videoAnalyzed');
                                }
                            });
                        }
                    });
                });
            });
        }
        else {
            // if buffer is full, write the buffered data to the file
            if (file.buffer.length > bufferSize){
                fs.write(file.fd, file.buffer, null, 'Binary', function (err) {
                    if (err) throw err;
                    file.buffer = "";
                });
            }

            const blockPosition = file.bytesUploaded / blockSize;
            const percentUploaded = (file.bytesUploaded / file.size) * 100;

            socket.emit('uploadMore', {blockPosition: blockPosition, percentUploaded: percentUploaded});
        }
    });
});


server.listen(3000);

