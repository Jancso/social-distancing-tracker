#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Created on Tue Apr 14 14:09:25 2020

This code was inspired by https://www.pyimagesearch.com/2018/08/13/opencv-people-counter/

@author: joel
"""
# import the necessary packages
from pyimagesearch.centroidtracker import CentroidTracker
from pyimagesearch.trackableobject import TrackableObject
from imutils.video import VideoStream
from imutils.video import FPS
from itertools import combinations 
from itertools import permutations
from pathlib import Path
import numpy as np
import argparse
import imutils
import time
import dlib
import cv2
import math 
import json 
import os

#################### Parser settings #########################################
#python group_detection.py home/joel/dev/example_01.mp4 -o home/joel/dev/example_01
parser = argparse.ArgumentParser(description='Detect groups in a video')

parser.add_argument("video", help='filename of video to analyse')

parser.add_argument(
    "-o", "--output",
    help='path where the output folder gets written into')

parser.add_argument(
    "-c", "--confidence",
    help="confidence level for the object detector to detect a person",
    default=0.4)

parser.add_argument(
    "-d", "--distance",
    help="distance (in pixels) that is allowed between people",
    default=150)

parser.add_argument(
    "-r", "--resize",
    help="resize the frame to a with of -r pixles (keep in mind the -d parameter)",
    default=500)

parser.add_argument(
    "-s", "--shrink",
    help="shrink-factor (-s) corrects for camara angle (allowed distance is measured as an ellipse with \
    (distance,shrink*distance) as the (length,hight) of the ellipse )",
    default=0.7)

parser.add_argument(
    "-k", "--skip",
    help="after how many frames to run the object detctor to detect people else track detected object",
    default=30)
    
    #(h,k) center of elipse
    #a,b = len and hight of elipse
    #(x,y) point to check if in elipse
    #if p <= 1 point is within the elipse and therefor too close!
def checkelipse( h, k, x, y, a, b): 
    # ellipse with the given point 
    p = ((math.pow((x - h), 2) // math.pow(a, 2)) + 
         (math.pow((y - k), 2) // math.pow(b, 2))) 
    return p 

def write_json(data, filename): 
    with open(filename,'w') as f: 
        json.dump(data, f, indent=4) 
        
def main(video=None, output=None, confidence=None, distance=None, resize=None, shrink=None, skip=None):

    if video is None or output is None:
        return False

    ######### Parameter (DEBUG) ##########################
    # video_input = "videos/example_01.mp4"
    # out_folder = 'output'
    # confidence_level = 0.4
    # width = 500 #resize frame to a width of 500 pixels 
    # allowed_distance = 150 
    # shrink_factor = 0.7
    
    #set paths and create output directory
    video_input = video
    folder_name = os.path.basename(video).split('.')[0] #name of the video file
    out_folder = os.path.join(output,folder_name)
    print(out_folder)
    if not os.path.exists(out_folder):
        os.mkdir(out_folder)
    output_video =  os.path.join(out_folder,"output_video.mp4")
    output_json =  os.path.join(out_folder, "output_data.json")
    out_overview = os.path.join(out_folder,'overview.json')
    output_groups =  os.path.join(out_folder,'groups')
    if not os.path.exists(output_groups):
        os.mkdir(output_groups)
    
    #set parsed parameters
    skip_frame = skip #object detection afer every ith frame
    confidence_level = confidence
    width = resize #resize frame to a width of 500 pixels 
    allowed_distance = distance
    shrink_factor = shrink
    
    #fixed or unused parameters for now
    group_size = 2 # nr people to count it as a group
    group_duration = 50
    video_stream = False
    show_window = False #show the frames in a window
                
    # initialize the list of class labels MobileNet SSD was trained to
    # detect
    CLASSES = ["background", "aeroplane", "bicycle", "bird", "boat",
        "bottle", "bus", "car", "cat", "chair", "cow", "diningtable",
        "dog", "horse", "motorbike", "person", "pottedplant", "sheep",
        "sofa", "train", "tvmonitor"]
    
    # load our serialized model from disk
    script_path = Path(__file__).resolve()
    script_dir_path = script_path.parent
    protext_path = str(script_dir_path / "mobilenet_ssd/MobileNetSSD_deploy.prototxt")
    model_path = str(script_dir_path / "mobilenet_ssd/MobileNetSSD_deploy.caffemodel")
    net = cv2.dnn.readNetFromCaffe(protext_path, model_path)
    
    #load video
    vs = cv2.VideoCapture(video_input)
    print('#'*80)
    print('start processing ' + os.path.basename(video))
    # instantiate our centroid tracker, then initialize a list to store
    # each of our dlib correlation trackers, followed by a dictionary to
    # map each unique object ID to a TrackableObject
    ct = CentroidTracker(maxDisappeared=40, maxDistance=50)
    trackers = []
    trackableObjects = {}
    
    # initialize the total number of frames processed thus far, along
    totalFrames = 0
    
    # start the frames per second throughput estimator
    fps = FPS().start()
    
    global_group_dict = {}
    group_count = 0
    
    writer = None
    
    #create an empty json file
    if video_stream:
        write_json({'detected groups':[]},output_json)
    # loop over frames from the video stream
    while True:
        
        #save a frames from groups
        save_frame = False
        save_name = None
        # grab the next frame and handle 
        ret, frame = vs.read()
    
        # if we are viewing a video and we did not grab a frame then we
        # have reached the end of the video
        if not ret:
            break
    
        # resize the frame to have a maximum width of 500 pixels
        # the frame from BGR to RGB for dlib
        frame = imutils.resize(frame, width=width)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    
        #get frame dimensions
        (H, W) = frame.shape[:2]
    
        #create writer
        if writer is None:
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            writer = cv2.VideoWriter(output_video, fourcc, 30,(W, H), True)
    
        # initialize the current status along with our list of bounding
        # box rectangles returned by either (1) our object detector or
        # (2) the correlation trackers
        status = "Waiting"
        rects = []
    
        # check to see if we should run a more computationally expensive
        # object detection method to aid our tracker
        if totalFrames % skip_frame == 0:
            # set the status and initialize our new set of object trackers
            status = "Detecting"
            trackers = []
            
            # convert the frame to a blob and pass the blob through the
            # network and obtain the detections
            blob = cv2.dnn.blobFromImage(frame, 0.007843, (W, H), 127.5)
            net.setInput(blob)
            detections = net.forward()
    
            # loop over the detections
            for i in np.arange(0, detections.shape[2]):
                # extract the confidence (i.e., probability) associated
                # with the prediction
                confidence = detections[0, 0, i, 2]
    
                # filter out weak detections by requiring a minimum
                # confidence
                if confidence > confidence_level:
                    # extract the index of the class label from the
                    # detections list
                    idx = int(detections[0, 0, i, 1])
    
                    # if the class label is not a person, ignore it
                    if CLASSES[idx] != "person":
                        continue
    
                    # compute the (x, y)-coordinates of the bounding box
                    # for the object
                    box = detections[0, 0, i, 3:7] * np.array([W, H, W, H])
                    (startX, startY, endX, endY) = box.astype("int")
                    cv2.rectangle(frame, (startX, startY), (endX, endY), (0, 255, 0), 2)
                    # construct a dlib rectangle object from the bounding
                    # box coordinates and then start the dlib correlation
                    # tracker
                    tracker = dlib.correlation_tracker()
                    rect = dlib.rectangle(startX, startY, endX, endY)
                    tracker.start_track(rgb, rect)
    
                    # add the tracker to our list of trackers so we can
                    # utilize it during skip frames
                    trackers.append(tracker)
    
        # otherwise, we should utilize our object *trackers* rather than
        # object *detectors* to obtain a higher frame processing throughput
        else:
            # loop over the trackers
            for tracker in trackers:
                # set the status of our system to be 'tracking' rather
                # than 'waiting' or 'detecting'
                status = "Tracking"
    
                # update the tracker and grab the updated position
                tracker.update(rgb)
                pos = tracker.get_position()
    
                # unpack the position object
                startX = int(pos.left())
                startY = int(pos.top())
                endX = int(pos.right())
                endY = int(pos.bottom())
    
                # add the bounding box coordinates to the rectangles list
                rects.append((startX, startY, endX, endY))
                cv2.rectangle(frame, (startX, startY), (endX, endY), (0, 255, 0), 2)
    
        # use the centroid tracker to associate the (1) old object
        # centroids with (2) the newly computed object centroids
        objects = ct.update(rects)
        
        #distance a person must have to another
        radius = int(allowed_distance)
        
        #dependency dictionray of all identified connected persons
        dep_dict = {}
        connections = combinations(objects.keys(),2)
        #draw a line if 2 person are in each others radius and add them to dep_dict
        for obj_a, obj_b in connections:
            node1 = (objects[obj_a][0],objects[obj_a][1])
            node2 = (objects[obj_b][0],objects[obj_b][1])
            
            #distance = (abs(node1[0]-node2[0])**2+abs(node1[1]-node2[1])**2)**0.5
            p = checkelipse( node1[0], node1[1], node2[0], node2[1], radius, radius*shrink_factor)
            
            #if distance < radius:
            if p <= 1:
                dep_dict[obj_a] = dep_dict[obj_a]+[obj_b] if obj_a in dep_dict.keys() else [obj_b]
                dep_dict[obj_b] = dep_dict[obj_b]+[obj_a] if obj_b in dep_dict.keys() else [obj_a] 
                cv2.line(frame,node1,node2,(0, 0, 255), 2)
             
        #check dependancies to create groups
        
        group_dict = {}
        dep_keys = list(dep_dict.keys())
        while dep_keys != []:
            a = dep_keys.pop()
            group = [a]
            stack = dep_dict[a]
            while stack != []:
                b = stack.pop()
                if b in dep_keys:
                    stack = stack + dep_dict[b]
                    group.append(b)
                    dep_keys.remove(b)
                    
            group.sort()
            #calc unique group hash and check if allready exist
            group_id =  hash(str(group))
            
            sub_groups = []
            for i in range(len(group)-2):
                sub_groups.extend(list(map(list, combinations(group,i+2))))
            
            for sub in sub_groups:
                sub_id = hash(str(sorted(sub)))
                if sub_id in global_group_dict.keys():
                    dic = global_group_dict[sub_id]
                    dic['duration']+=1
            
            if not group_id in global_group_dict.keys():
                group_count+=1
                data = {'group_nr' : group_count,
                        'frame': totalFrames, 
                        'timestamp': vs.get(cv2.CAP_PROP_POS_MSEC),
                        'duration' : 1,
                        'persons': group}
                if video_stream:
                    data['detected'] = False #depends on group_duration
                global_group_dict[group_id] = data
                print('group detected with follwing people: ' +str(group))
                if len(group)>=group_size:
                    save_frame = True
                    save_name = 'group_' + str(group_count)
            else:
                #count in how many frames this group was detected
                dic = global_group_dict[group_id]
                dic['duration']+=1
                
                
                if video_stream:
                #write to json file if group in more then group_duration frames
                    if dic['duration'] > group_duration and not dic['detected']:
                        dic['detected'] = True
                        group_data = {
                            'group_nr' : dic['group_nr'],
                            'frame': dic['frame'],
                            'people_id' : dic['persons']
                            }
                        with open(output_json) as json_file:
                            data = json.load(json_file)
                            temp = data['detectedd groups']
                            temp.append(group_data )
                            write_json(data)
                    
                    #save farme as jpg
                    
                
            group_dict[str(group_id)] = group
            
        for g, nodes in group_dict.items():
            if len(nodes) >= group_size:
                #print(g+str(nodes))
                points = np.array([[objects[x][0],objects[x][1]] for x in nodes])
                alpha=0.8
                overlay = frame.copy()
                cv2.fillPoly(overlay, np.int32([points]), (0,0,255))
                cv2.addWeighted(overlay, alpha, frame, 1 - alpha,0,frame)
                #cv2.putText(frame, text, (centroid[0] - 10, centroid[1] - 10),
                 #   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
        
        # loop over the tracked objects
        for (objectID, centroid) in objects.items():
            # check to see if a trackable object exists for the current
            # object ID
            to = trackableObjects.get(objectID, None)
    
            # if there is no existing trackable object, create one
            if to is None:
                to = TrackableObject(objectID, centroid)
    
            # otherwise, there is a trackable object so we can utilize it
            # to determine direction
            else:
                to.centroids.append(centroid)
    
            # store the trackable object in our dictionary
            trackableObjects[objectID] = to
    
            # draw both the ID of the object and the centroid of the
            # object on the output frame
            text = "ID {}".format(objectID)
            cv2.putText(frame, text, (centroid[0] - 10, centroid[1] - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
            #cv2.circle(frame, (centroid[0], centroid[1]), radius, (0, 255, 0), 2)
            axesLength = (radius,int(radius*shrink_factor))
            angle = 0
            startAngle = 0
            endAngle = 360
            cv2.ellipse(frame, (centroid[0], centroid[1]), axesLength, angle, startAngle,
                        endAngle, (0, 255, 0), 2) 
    
        # construct a tuple of information we will be displaying on the
        # frame
        info = [
            ("Status", status)
        ]
    
        # loop over the info tuples and draw them on our frame
        for (i, (k, v)) in enumerate(info):
            text = "{}: {}".format(k, v)
            cv2.putText(frame, text, (10, H - ((i * 20) + 20)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
    
        # check to see if we should write the frame to disk
        if writer is not None:
            writer.write(frame)
            
        if show_window:
            # show the output frame
            cv2.imshow("Frame", frame)
            key = cv2.waitKey(1) & 0xFF
        
            # if the `q` key was pressed, break from the loop
            if key == ord("q"):
                break
            if key == ord("b"):
                key = cv2.waitKey(0) & 0xFF 
        
        if save_frame:
            cv2.imwrite(output_groups+'/' + save_name +'.jpg', frame)
    
        # increment the total number of frames processed thus far and
        # then update the FPS counter
        totalFrames += 1
        fps.update()
    
    # stop the timer and display FPS information
    fps.stop()
    print('#'*80)
    print('finished video processing')
    print("[INFO] elapsed time: {:.2f}".format(fps.elapsed()))
    print("[INFO] approx. FPS: {:.2f}".format(fps.fps()))
    
    
    # check to see if we need to release the video writer pointer
    if writer is not None:
        writer.release()
    vs.release()
    # close any open windows
    cv2.destroyAllWindows()
    
    write_json(global_group_dict,filename=out_overview)

  

if __name__ == "__main__" :
    args = parser.parse_args()
    main(**vars(args))
  
  
