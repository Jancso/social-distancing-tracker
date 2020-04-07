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

### Set up Node.js environment
Set up Node.js
* Install Node.js, version 13 (tested on v13.12.0)
* Install npm, version 6 (tested on v6.14.4)
* Install dependencies:
```shell script
npm install
```

Create .env file:
* Create a file named '.env' in the root directory of the repository.
* Set the corresponding environment variables in the file with the 
saved password and username plus the database name.
```.env
CLOUDANT_USERNAME=your_saved_username
CLOUDANT_PASSWORD=your_saved_password
CLOUDANT_DB=imagedb
```

Set up opencv:
* Install opencv according to the instructions [here](https://docs.opencv.org/master/df/d65/tutorial_table_of_content_introduction.html)
* Create object detection executable
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

### Run node.js server
* Run server in the root directory of the repository:
```shell script
npm start
```
* Open browser and load web application with URL:
```shell script
localhost:3000
```

### Run python application
* Run application with a pre-recorded video
 in the root directory of the repository:
```shell script
python cv_object_detection.py sample_videos/vid10.mp4 127.0.0.1 3000
```
* Click on `Refresh` in the web application and 
a list of extracted image data should be shown.
