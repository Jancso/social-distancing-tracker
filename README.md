##Setup

Tested on Ubuntu 18.04

### Authentication System

* Install MongoDB Community Edition (https://docs.mongodb.com/manual/tutorial/install-mongodb-on-ubuntu/)

* Create database:
```
$ mongo

> use MyDatabase;

> exit
```

* Set user credentials:
open `index.js` and uncomment and adapt user credentials
`//UserDetails.register({username:'anna', active: false}, 'anna');`


### Social Distancing Tracker
* `$ cd people_detection`
* Ensure python 3.5 is installed
* `$ sudo apt-get install python3-venv`
* `$ python3.5 -m venv venv`
* `$ source venv/bin/activate`
* `$ sudo apt-get install build-essential cmake libopenblas-dev liblapack-dev libx11-dev libgtk-3-dev python python-dev python-pip python3 python3-dev python3-pip`
* `$ pip install -vr requirements.txt` (NB: the dlib dependency requires at least >2GB RAM and needs to be created from a clean
virtual environment)
d)


### UI
* `$ cd app/`
* Install nvm:

`curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash
`

(open new terminal after that)

* nvm install stable (version 14)
* npm install
* sudo apt-get install ffmpeg
* run application

`$ node index.js`

