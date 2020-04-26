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
            const video = {};
            video.name = file;
            videos.push(video);
        });

        res.render('videos.html', {'videos': videos});
    });
});


app.get('/videos/:videoId/', function (req, res) {
    const videoName = req.params['videoId'];
    const video = {'name': videoName};
    res.render('video.html', {'video': video});
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
                    const abs_file_path = path.resolve(videos_dir + fileName);
                    let cmd = `../venv/bin/python ../people_detection/people_count_dev.py ${abs_file_path}`;

                    child_process.exec(cmd, (err, stdout) => {
                        if (err) {
                            console.error(err);
                        } else {
                            console.log(stdout);
                            console.log(`file ${fileName} analyzed!`);
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

