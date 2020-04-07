// for routing
const express = require('express');
// for interacting with the database
const sqlite = require('sqlite');
const Promise = require('bluebird');
require("async");
require('await');
// to read, create, update, delete, move, rename files
const fs = require('fs');
// to execute system commands
const child_process = require("child_process");
// to use IBM's Cloudant database
const Cloudant = require('@cloudant/cloudant');
// to read environment variables from the .env file
require('dotenv').load();

const uploads_dir = './uploads';

if (!fs.existsSync(uploads_dir)){
    fs.mkdirSync(uploads_dir);
}

const multer = require('multer');
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './uploads/')
    },
    filename: function (req, file, cb) {
        console.log("saving " + req.body.filename);
        cb(null, req.body.filename)
    }

});
const upload = multer({
    storage: storage
});

const router = express.Router();

router.get('/', function (req, res) {
    res.render('index.html');
    res.send(200)
});

let imagedb = null;

const initCloudant = function () {
    const username = process.env.CLOUDANT_USERNAME || "nodejs";
    const password = process.env.CLOUDANT_PASSWORD;
    const cloudant = Cloudant({account: username, password: password});
    console.log("Initializing Cloudant DB");
    imagedb = cloudant.db.use(process.env.CLOUDANT_DB, function (err, body) {
        console.log(body);
        if (err) {
            console.log(err);
            console.log("Creating Cloudant Table");
            cloudant.db.create(process.env.CLOUDANT_DB, function (err, body) {

                console.log(body);
                if (err) {
                    console.log(err)
                } else {
                    console.log("Created Cloudant DB table")
                }
            })
        } else {
            console.log("Cloudant DB initialized")
        }
    })

};

initCloudant();

const createCloudantWithAttachments = function (docID, imagePath, eventProps) {
    console.log("creating cloudant doc");
    const i = imagePath.split('/');
    const imageName = i[i.length - 1];
    console.log("loading: " + imagePath);
    fs.readFile("detected_images/output.jpg", function (err, data) {
        if (!err) {
            console.log("inserting document");
            console.log(docID);
            console.log(imagePath);
            console.log(eventProps);
            console.log(data);
            console.log('image/' + imageName.split('.')[1]);
            imagedb.multipart.insert(eventProps,
                [{
                    name: imageName,
                    data: data,
                    content_type: 'image/' + imageName.split('.')[1]
                }], docID, function (err, body) {
                    if (!err) {
                        console.log(body);
                    } else {
                        console.log("error uploading attachment");
                        console.log(err)
                    }
                })
        } else {
            console.log("error loading file")
        }
    })
};


const parseClasses = function (original) {
    const classes_edited = {};
    original['classes'].map(function (key, idx) {
        const cls = key['class'];
        if (classes_edited[cls]) {
            console.log("class key exists, appending");
            classes_edited[cls]["data"].push(key);
            classes_edited[cls]["count"] += 1
        } else {
            console.log("creating new class key");
            classes_edited[cls] = {
                data: [key],
                count: 1
            }
        }
        // return classes_edited
        console.log("key", key['class']);
        console.log("value", idx)
    });
    return classes_edited
};

router.get('/query/all', function (req, res) {
    res.setHeader('Content-Type', 'application/json');
    imagedb.list({include_docs: true}, function (err, data) {
        console.log(err, data);
        res.json(data)
    })
});



router.post('/image/upload',
    upload.single('file'), function (req, res, next) {
        if (req.file) {
            try {
                const path = "yolo_object_detection/";
                const objectDetectionBin = path + "ObjectDetection";
                const modelConfigPath = path + "yolov3.cfg";
                const modelWeightsPath = path + "yolov3.weights";
                const modelClassesPath = path + "object_detection_classes_yolov3.txt";
                const imagePath = "uploads/" + req.body.filename;
                const miscOpts = "--width=384 --height=384 --scale=0.00392 --rgb";
                const cmd = [objectDetectionBin, " -c=" + modelConfigPath, " -m=" + modelWeightsPath, " -i=" + imagePath, miscOpts, " --classes '" + modelClassesPath + "'"];
                const cmd_str = cmd.join(" ");
                const extractClasses = child_process.execSync(cmd_str).toString();
                const doc_contents = {};
                console.log("document:", Object.assign(doc_contents, req.body, {classes: parseClasses(JSON.parse(extractClasses))}));

                createCloudantWithAttachments(
                    req.body.time + '-' + req.body.channel + '-' + req.body.location,
                    imagePath,
                    Object.assign(
                        doc_contents,
                        req.body, {
                            classes: parseClasses(JSON.parse(extractClasses))
                        }
                    ),
                );
                res.send({payload: parseClasses});
                console.log("updated")
            } catch (err) {
                console.log(err);
                res.send(500)
            }
        }
    });


module.exports = router;
