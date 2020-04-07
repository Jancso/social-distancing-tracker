# ai-surveillance

## Set up instructions for [IBM code](https://github.com/IBM/dnn-object-detection)

### Set up cloud database
We will use a cloud database to store the detected objects of a video frame. 
Since the detected objects are stored in a JSON file, 
we will use IBM's Cloudant database which is a JSON document database.
* Create an account on [IBM cloud](https://cloud.ibm.com)
* Create a Cloudant service on https://cloud.ibm.com/catalog/services/cloudant
using Lite plan
* Create credentials for the Cloudant service under 
'_Service credentials_'-> '_New credential_'.
* Click on '_View credentials_' and save '_password_' and '_username_' values 
somewhere on your computer.
* Launch a new database under '_Manage_' -> '_Dashboard_' -> '_Databases_'
* Create a new database by clicking on '_Create Database_'. Name it e.g.
'_imagedb_'

### Clone our repository
```shell script
git clone https://github.com/Jancso/ai-surveillance.git
```

### Create .env file
* Create a file named '.env' in the root directory of the repository.
* Set the corresponding environment variables in the file with the 
saved password and username plus the database name.
```.env
CLOUDANT_USERNAME=your_saved_username
CLOUDANT_PASSWORD=your_saved_password
CLOUDANT_DB=imagedb
```

### Set up node.js server
* Install node.js
```shell script
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.11/install.sh | bash
nvm install v8.9.0
nvm use 8.9.0
```
* Install and start docker
* Run node.js server in the root directory of the repository:
```shell script
docker run -d -p 3000:3000 --env-file .env --name opencv_yolo kkbankol/opencv_yolo_pod
```
This will pull the docker image with the given Dockerfile, 
create a container from it and start it. In
case, you already created the container, but it is not running (which you
can check by executing '`docker container ls`'), you can start it by executing
'`docker start -a opencv_yolo`'. In both cases, you should get the following
output:
```
Now using node v8.9.0 (npm v5.5.1)

> cameras-app@0.0.0 start /opt/cameras_app
> node ./bin/www

Initializing Cloudant DB
```

### Set up opencv
* Install opencv according to the instructions [here](https://docs.opencv.org/master/df/d65/tutorial_table_of_content_introduction.html)
* Create executable
```shell script
cd yolo_object_detection
cmake .
make
```
* Download `yolov3.weights` [here](https://pjreddie.com/media/files/yolov3.weights)
and put it in the `yolo_object_detection` directory

### Set up Python environment
* Install python >=3.7
```shell script
# Mac OS
brew install python3
# Linux
sudo apt-get install python3.7
```
* Install ffmpeg
```shell script
# Mac OS
brew install ffmpeg
# Linux
sudo apt-get install ffmpeg
```
* Create a python virtual environment in the root directory of the repository
```shell script
python3.7 -m venv venv
```
* Activate virtual environment
```shell script
source venv/bin/activate
```
* Install python dependencies:
```shell script
pip install requests numpy opencv-contrib-python
```

### Run application
Run application with a pre-recorded video
 in the root directory of the repository:
```shell script
python cv_object_detection.py sample_videos/vid10.mp4 127.0.0.1 3000
```
