import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
ApplicationWindow {
    width: 1500; height: 920; visible: true; title: "DirectorCut"; color: "#0b0c0f"
    property color panel: "#12141a"
    property color line: "#252a33"
    header: ToolBar { background: Rectangle { color: "#0f1116" }
        RowLayout { anchors.fill: parent; anchors.margins: 8
            Label { text: "DIRECTORCUT"; font.bold: true; font.pixelSize: 18; color: "white" }
            Label { text: "  Project: Untitled"; color: "#89909d" }
            Item { Layout.fillWidth: true }
            ComboBox { model: ["Ask","Co-edit","Auto"] }
            Button { text: "Export" }
        }
    }
    ColumnLayout { anchors.fill: parent; spacing: 1
        RowLayout { Layout.fillWidth: true; Layout.fillHeight: true; Layout.preferredHeight: 620; spacing: 1
            Rectangle { Layout.preferredWidth: 250; Layout.fillHeight: true; color: panel
                Column { anchors.fill: parent; anchors.margins: 14; spacing: 12
                    Label { text: "PROJECT"; color: "#7c8491"; font.bold: true }
                    Repeater { model: ["Media","Scenes","Script","References","Graphics","Skills"]
                        delegate: Button { width: 220; text: modelData }
                    }
                }
            }
            Rectangle { Layout.fillWidth: true; Layout.fillHeight: true; color: "#07080a"
                Rectangle { anchors.centerIn: parent; width: parent.width*0.82; height: parent.height*0.74; color: "black"; border.color: line
                    Text { anchors.centerIn: parent; text: "PROGRAM MONITOR\n00:00:00.000"; horizontalAlignment: Text.AlignHCenter; color: "#525a67" }
                }
            }
            Rectangle { Layout.preferredWidth: 340; Layout.fillHeight: true; color: panel
                ColumnLayout { anchors.fill: parent; anchors.margins: 12
                    Label { text: "DIRECTOR"; color: "white"; font.bold: true; font.pixelSize: 16 }
                    ScrollView { Layout.fillWidth: true; Layout.fillHeight: true
                        TextArea { readOnly: true; wrapMode: Text.Wrap; color: "#d7dbe1"; text: "Ready. Give me a script or footage.\n\nI will break it into scenes, build an edit plan, and show every proposed operation before changing the timeline in Co-edit mode."; background: null }
                    }
                    TextField { Layout.fillWidth: true; placeholderText: "Tell Director what to change…" }
                    Button { Layout.fillWidth: true; text: "Send" }
                }
            }
        }
        Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 290; color: "#101218"
            ColumnLayout { anchors.fill: parent; anchors.margins: 10
                RowLayout { Label { text: "TIMELINE"; color: "white"; font.bold: true } Item { Layout.fillWidth: true } Label { text: "Transcript  |  Mixer  |  Inspector"; color: "#848b98" } }
                Repeater { model: ["V2  Graphics","V1  Video","A1  Dialogue","A2  Music"]
                    delegate: Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 47; color: index%2?"#151821":"#12151c"; border.color: line
                        Row { anchors.verticalCenter: parent.verticalCenter; spacing: 12; Text { width: 110; text: modelData; color: "#aeb4bf" }
                            Rectangle { width: 330; height: 30; radius: 4; color: index===1?"#273a54": index===2?"#2e463a":"#2a2d36"; Text { anchors.centerIn: parent; text: index<3?"Scene 01":""; color:"white" } }
                        }
                    }
                }
            }
        }
    }
}
