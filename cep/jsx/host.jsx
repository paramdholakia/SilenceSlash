/**
 * SilenceSlash ExtendScript Host Script for Adobe Premiere Pro (V12 - V25+)
 * Handles clip resolution, project sequence discovery, and XML importing
 */

var SilenceSlashHost = {
    /**
     * Import an XML sequence into the active Premiere Pro project and open it in the timeline.
     */
    importXml: function(xmlPath) {
        if (typeof app === 'undefined' || !app.project) {
            return "ERROR: No active project found in Premiere Pro. Please open or create a project first.";
        }
        try {
            var file = new File(xmlPath);
            if (!file.exists) {
                return "ERROR: XML file not found at: " + xmlPath;
            }

            var root = app.project.rootItem;

            // Snapshot existing sequences before import to identify the new one
            var prevSeqIDs = {};
            if (app.project.sequences) {
                for (var s = 0; s < app.project.sequences.numSequences; s++) {
                    var seq = app.project.sequences[s];
                    if (seq && seq.sequenceID) {
                        prevSeqIDs[seq.sequenceID] = true;
                    }
                }
            }

            // importFiles(fileArray, suppressUI, targetBin, importAsNumberedStills)
            var success = app.project.importFiles([file.fsName], true, root, false);

            if (success) {
                // Find newly imported sequence and open it in the timeline view
                var importedSeq = null;
                if (app.project.sequences) {
                    for (var s = 0; s < app.project.sequences.numSequences; s++) {
                        var seq = app.project.sequences[s];
                        if (seq && !prevSeqIDs[seq.sequenceID]) {
                            importedSeq = seq;
                            break;
                        }
                    }
                }

                // Fallback: If not found in diff, take the latest sequence
                if (!importedSeq && app.project.sequences && app.project.sequences.numSequences > 0) {
                    importedSeq = app.project.sequences[app.project.sequences.numSequences - 1];
                }

                // If sequence found, open it and set as active sequence in timeline
                if (importedSeq) {
                    try {
                        app.project.openSequence(importedSeq.sequenceID);
                    } catch(e1) {}
                    try {
                        app.project.activeSequence = importedSeq;
                    } catch(e2) {}
                    return "SUCCESS: Opened sequence '" + importedSeq.name + "'";
                }

                return "SUCCESS";
            } else {
                return "ERROR: Premiere Pro rejected the XML sequence import.";
            }
        } catch (e) {
            return "ERROR: " + e.toString();
        }
    },

    /**
     * Finds media file path from the currently active sequence or selected items in the Project panel.
     */
    getActiveSequenceMedia: function() {
        if (typeof app === 'undefined' || !app.project) {
            return "ERROR_NO_PROJECT";
        }

        // Strategy 1: Check active sequence playhead clip or tracks
        try {
            var seq = app.project.activeSequence;
            if (seq) {
                // Check video tracks
                if (seq.videoTracks && seq.videoTracks.numTracks > 0) {
                    for (var vt = 0; vt < seq.videoTracks.numTracks; vt++) {
                        var vTrack = seq.videoTracks[vt];
                        if (vTrack && vTrack.clips && vTrack.clips.numItems > 0) {
                            for (var c = 0; c < vTrack.clips.numItems; c++) {
                                var clip = vTrack.clips[c];
                                if (clip && clip.projectItem) {
                                    var p = clip.projectItem.getMediaPath();
                                    if (p && p.length > 0) return p;
                                }
                            }
                        }
                    }
                }

                // Check audio tracks
                if (seq.audioTracks && seq.audioTracks.numTracks > 0) {
                    for (var at = 0; at < seq.audioTracks.numTracks; at++) {
                        var aTrack = seq.audioTracks[at];
                        if (aTrack && aTrack.clips && aTrack.clips.numItems > 0) {
                            for (var ac = 0; ac < aTrack.clips.numItems; ac++) {
                                var aClip = aTrack.clips[ac];
                                if (aClip && aClip.projectItem) {
                                    var ap = aClip.projectItem.getMediaPath();
                                    if (ap && ap.length > 0) return ap;
                                }
                            }
                        }
                    }
                }
            }
        } catch(e1) {}

        // Strategy 2: Check selected project item in Project Panel
        try {
            var viewIDs = app.getProjectViewIDs();
            if (viewIDs && viewIDs.length > 0) {
                for (var v = 0; v < viewIDs.length; v++) {
                    var selected = app.getProjectItemsFromViewID(viewIDs[v]);
                    if (selected && selected.length > 0) {
                        for (var s = 0; s < selected.length; s++) {
                            var pItem = selected[s];
                            if (pItem) {
                                var mediaPath = pItem.getMediaPath();
                                if (mediaPath && mediaPath.length > 0) {
                                    return mediaPath;
                                }
                            }
                        }
                    }
                }
            }
        } catch(e2) {}

        // Strategy 3: Iterate root project bin for any video/audio item
        try {
            var root = app.project.rootItem;
            if (root && root.children && root.children.numItems > 0) {
                for (var r = 0; r < root.children.numItems; r++) {
                    var item = root.children[r];
                    if (item && item.type === 1) { // 1 = CLIP
                        var rp = item.getMediaPath();
                        if (rp && rp.length > 0) return rp;
                    }
                }
            }
        } catch(e3) {}

        return "NO_CLIPS_FOUND";
    },

    /**
     * Get directory of current Premiere Pro project file
     */
    getProjectDir: function() {
        if (typeof app !== 'undefined' && app.project && app.project.path) {
            var pFile = new File(app.project.path);
            if (pFile.parent && pFile.parent.exists) {
                return pFile.parent.fsName;
            }
        }
        return Folder.desktop.fsName;
    },

    /**
     * Reveal file in system file browser
     */
    openInExplorer: function(filePath) {
        try {
            var f = new File(filePath);
            if (f.exists) {
                f.parent.execute();
                return "SUCCESS";
            }
        } catch(e) {}
        return "FAILED";
    }
};
