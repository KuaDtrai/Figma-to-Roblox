var HandledError = false;
var CurrentNotif;
var ImageExports = {};
var QueuedImages = 0;
var greatestAncestor;

function QuickClose(Message) {
    if (CurrentNotif !== undefined) CurrentNotif.cancel();

    HandledError = true;
    figma.notify(`Error: ` + Message, { timeout: 10000 });
    figma.closePlugin();

    throw new Error(Message);
}

function Notify(Message) {
    if (CurrentNotif !== undefined) CurrentNotif.cancel();

    CurrentNotif = figma.notify(Message);
}

function getGradientRotation(gradientTransform) {
    const a = gradientTransform[0][0];
    const b = gradientTransform[0][1];
    const angle = Math.atan2(b, a) * 180 / Math.PI;

    return angle >= 0 ? angle : angle + 360;
}

function LimitDecimals(Number, Decimals) { 
    // Giới hạn số chữ số thập phân và làm tròn
    if (typeof Number !== "number" || isNaN(Number)) return 0;
    if (Decimals === undefined || isNaN(Decimals)) Decimals = 0;
    else Decimals = Math.max(0, Math.floor(Decimals)); // Đảm bảo Decimals là số nguyên không âm

    return parseFloat(Number.toFixed(Decimals));
}


const FontEnumMap = {
    "Legacy" : 0,
    "Arial" : 1,
    // "Arial Bold" : 2,
    "Source Sans Pro" : 3,
    // "Source Sans Bold" : 4,
    // "Source Sans Light" : 5,
    // "SourceSansItalic" : 6,
    "Bodoni Moda" : 7,
    "Garamond" : 8,
    "Cartoon" : 9,
    "Code" : 10,
    "Highway" : 11,
    "SciFi" : 12,
    "Arcade" : 13,
    "Fantasy" : 14,
    "Antique" : 15,
    // "SourceSansSemibold" : 16,
    "Gotham" : 17,
    // "GothamMedium" : 18,
    // "GothamBold" : 19,
    // "GothamBlack" : 20,
    "Amatic SC" : 21,
    "Bangers" : 22,
    "Creepster" : 23,
    "Denk One" : 24,
    "Fondamento" : 25,
    "Fredoka One" : 26,
    "Grenze Gotisch" : 27,
    "Indie Flower" : 28,
    "Josefin Sans" : 29,
    "Jura" : 30,
    "Kalam" : 31,
    "Luckiest Guy" : 32,
    "Merriweather" : 33,
    "Michroma" : 34,
    "Nunito" : 35,
    "Oswald" : 36,
    "Patrick Hand" : 37,
    "Permanent Marker" : 38,
    "Roboto" : 39,
    "Roboto Condensed" : 40,
    "Roboto Mono" : 41,
    "Sarpanch" : 42,
    "Special Elite" : 43,
    "Titillium Web" : 44,
    "Ubuntu" : 45,
    "Builder Sans" : 46,
    // "BuilderSansMedium" : 47,
    // "BuilderSansBold" : 48,
    // "BuilderSansExtraBold" : 49,
    "Arimo" : 50,
    // "ArimoBold" : 51,
    "Unknown" : 100,
    // Thêm các ánh xạ khác nếu cần
    // Nếu không khớp, mặc định là "SourceSans"
};

const LineJoinModes = [
    "Round",
    "Bevel",
    "Miter"
]

const TextXAlignments = [
    "LEFT",
    "RIGHT",
    "CENTER",
]

const TextYAlignments = [
    "TOP",
    "CENTER",
    "BOTTOM",
]

function Random() {
    return ((Math.random() * Math.random()) * 9e15) ^ Math.random(); // It's good enough
}

function ExportImage(Element, Properties, CustomExport) {
    QueuedImages++;

    const Name = CustomExport ? CustomExport.suffix : Element.name;

    Element.exportAsync(CustomExport || { format: "PNG", contentsOnly: true, constraint: { type: "SCALE", value: 2 } }).then(Bytes => {
        var UploadId = Random();

        while (ImageExports[UploadId] !== undefined) UploadId = Random();

        for (var i = 0; i < ImageExports.length; i++) {
            if (ImageExports[i].Bytes == Bytes) {
                UploadId = ImageExports[i].UploadId;
            }
        }

        Properties.UploadId = UploadId;

        ImageExports[UploadId] = {
            Bytes: Bytes, // Uint8Array
            UploadId: UploadId,
        };

        figma.ui.postMessage({
            type: "UploadImage",
            data: {
                ImageData: Bytes,
                UploadId: UploadId,
                ImageName: Name.replace(/EI[-]?/, ""),
                ImageFormat: CustomExport ? CustomExport.format : "PNG",
            },
        });
    });
}

const PropertyTypes = {
    ["children"]: (Element, Properties) => {
        if (Properties.NoChildren || Properties.Children == undefined || Properties.Class == "ImageLabel") return;
        
        for (var i = 0; i < Element.children.length; i++) {
            Properties.Children.push(GetMainProperties(Element.children[i], Properties));
        }
    },



    ["exportSettings"]: (Element, Properties) => {
        const ExportSettings = Element.exportSettings[0];
        if (ExportSettings && Properties.Class !== "ImageLabel" && ExportSettings.suffix.match(/EI/)) {
            Properties.Class = "ImageLabel";
            Properties.ImageTransparency = Properties.BackgroundTransparency;
            Properties.BackgroundTransparency = 0;
            Properties.NoChildren = true;
            Properties.Children = undefined;

            if (ExportSettings.format !== "PNG" && ExportSettings.format !== "JPG") {
                return QuickClose("Unsupported image format: " + ExportSettings.format + ", on element: " + Element.name);
            }

            ExportImage(Element, Properties, ExportSettings);

            return true;
        }

        return false;
    },
    ["fills"]: (Element, Properties) => {
        if (Element.fills.length > 1) {
            // Đối tượng có nhiều hơn một fill, xuất thành hình ảnh
            Properties.Class = "ImageLabel";
            Properties.BackgroundTransparency = 0;
            Properties.ImageTransparency = Element.fills[0].opacity;
            
            ExportImage(Element, Properties);
            return;
        } else if (Element.fills.length == 0) {
            // Đối tượng không có fill, đặt màu nền mặc định
            Properties.BackgroundColor3 = {R: 0, G: 0, B: 0}; // TODO: default to missing texture
        }
    
        const Filler = Element.fills[0];
    
        if (!Filler) return;
    
        switch (Filler.type) {
            case "SOLID":
                var Colour = {
                    R: Filler.color.r,
                    G: Filler.color.g,
                    B: Filler.color.b,
                };
    
                if (Properties.Class == "TextLabel") {
                    Properties.TextColor3 = Colour;
                } else {
                    Properties.BackgroundColor3 = Colour;
                }
    
                break;
            case "GRADIENT_LINEAR":
                if (Properties.Class == "TextLabel") {
                    Properties.TextColor3 = {R: 1, G: 1, B: 1};
                } else {
                    Properties.BackgroundColor3 = {R: 1, G: 1, B: 1};
                }
    
                const Transform = Filler.gradientTransform;
                const Rotation = getGradientRotation(Transform);
    
                Properties.Children.push({
                    Class: "UIGradient",
                    Type: "UIGradient",
                    Transparency: 1 - Filler.opacity,
                    Enabled: Filler.visible,
                    Colour: Filler.gradientStops.map((Stop) => {
                        return {
                            Colour: {
                                R: Stop.color.r,
                                G: Stop.color.g,
                                B: Stop.color.b,
                            },
                            TimePosition: Stop.position
                        }
                    }),
                    Transparency: Filler.gradientStops.map((Stop) => {
                        return {
                            Transparency: 1 - Stop.color.a,
                            TimePosition: Stop.position
                        }
                    }),
                    Rotation: Rotation,
                    Children: []
                });
    
                break;
            case "IMAGE":
                if (Properties.Class !== "ImageLabel") {
                    Properties.Class = "ImageLabel";
                    Properties.BackgroundTransparency = 0;
                    Properties.ImageTransparency = Filler.opacity;
    
                    ExportImage(Element, Properties);
                }
    
                break;
            default:
                return QuickClose(`Unsupported fill type '${Filler.type}' for: ${Element.name}`);
        }
    }
    ,
    ["cornerRadius"]: (Element, Properties) => {
        if (Element.cornerRadius == figma.mixed) {
            // Xử lý trường hợp cornerRadius là mixed
            Properties.Class = "ImageLabel";
            Properties.BackgroundTransparency = Element.opacity;
            ExportImage(Element, Properties);
        } else if (Element.cornerRadius != 0) {
            Properties.Children.push({
                Class: "UICorner",
                Type: "UICorner",
                CornerRadius: {
                    S: 0,
                    O: Element.cornerRadius,
                },
                Children: []
            });
        }
    },
    ["fontName"]: (Element, Properties) => {
    const UsedFonts = Element.getStyledTextSegments(["fontName", "fontSize", "fontWeight", "fills"]);

    if (UsedFonts.length === 1) {
        // Ánh xạ phông chữ Figma sang Enum.Font
        const fontName = Element.fontName.family + (Element.fontName.style !== "Regular" ? ` ${Element.fontName.style}` : "");
        Properties.FontEnum = FontEnumMap[fontName] || "SourceSans"; // Mặc định là SourceSans nếu không khớp
        Properties.TextSize = Element.fontSize == figma.mixed ? 0 : Element.fontSize;
        return;
    }

    // Xử lý RichText (nếu có nhiều phông chữ)
    Properties.RichText = true;
    var NewText = "";

    for (var i = 0; i < UsedFonts.length; i++) {
        const Font = UsedFonts[i];
        const fontName = Font.fontName.family + (Font.fontName.style !== "Regular" ? ` ${Font.fontName.style}` : "");
        const enumFont = FontEnumMap[fontName] || "SourceSans";

        let NextTextSegment = `<font font="${enumFont}"`;
        if (Font.fontSize !== Element.fontSize) {
            NextTextSegment += ` size="${Font.fontSize}"`;
        }
        if (Font.fills.length > 0 && Font.fills[0].type === "SOLID") {
            const Colour = Font.fills[0].color;
            NextTextSegment += ` color="rgb(${LimitDecimals(Colour.r * 255, 0)},${LimitDecimals(Colour.g * 255, 0)},${LimitDecimals(Colour.b * 255, 0)})"`;
            NextTextSegment += ` transparency="${1 - Font.fills[0].opacity}"`;
        }
        NextTextSegment += `>${Font.characters}</font>`;
        NewText += NextTextSegment;
    }

    Properties.Text = "<![CDATA[" + NewText + "]]>";
},
    ["strokes"]: (Element, Properties) => {
        if (Element.strokes.length == 0) {
            return;
        }
        const Stroke = Element.strokes[0];

        if ((Stroke.type !== "SOLID" && Stroke.type !== "GRADIENT_LINEAR") || Stroke.visible === false) return;

        if (Stroke.type === "GRADIENT_LINEAR") {
            const Transform = Stroke.gradientTransform;
            const Rotation = getGradientRotation(Transform);

            Properties.Children.push({
                Class: "UIStroke",
                Type: "UIStroke",
                Colour: {
                    R: 1,
                    G: 1,
                    B: 1,
                },
                Transparency: Element.opacity,
                Thickness: Element.strokeWeight,
                LineJoinMode: Element.strokeJoin.substring(0, 1).toUpperCase() + Element.strokeJoin.substring(1).toLowerCase(),
                Children: [{
                    Class: "UIGradient",
                    Type: "UIGradient",
                    Transparency: 1 - Stroke.opacity,
                    Enabled: Stroke.visible,
                    Colour: Stroke.gradientStops.map((Stop) => {
                        return {
                            Colour: {
                                R: Stop.color.r,
                                G: Stop.color.g,
                                B: Stop.color.b,
                            },
                            TimePosition: Stop.position
                        }
                    }),
                    Transparency: Stroke.gradientStops.map((Stop) => {
                        return {
                            Transparency: 1 - Stop.color.a, // Bastards for using RGBA
                            TimePosition: Stop.position
                        }
                    }),
                    Rotation: Rotation,
                    Children: []
                }]
            });

            return;
        }

        Properties.Children.push({
            Class: "UIStroke",
            Type: "UIStroke",
            Colour: {
                R: Stroke.color.r || 1,
                G: Stroke.color.g || 1,
                B: Stroke.color.b || 1,
            },
            Transparency: Element.opacity,
            Thickness: Element.strokeWeight,
            LineJoinMode: Element.strokeJoin.substring(0, 1).toUpperCase() + Element.strokeJoin.substring(1).toLowerCase(),
            Children: []
        });
    }
}

const ElementTypes = {
    ["GROUP"]: (Element, Parent) => {
        var Properties = {
            Class: "Frame",
            Type: Element.type,
            Name: Element.name,
            BackgroundTransparency: 0,
            BorderSizePixel: 0,
            GroupOpacity: Element.opacity,
            Visible: Element.visible,
            Position: {
                X: (Element.x + Element.width / 2) / greatestAncestor.width,
                Y: (Element.y + Element.height / 2) / greatestAncestor.height
            },
            _OriginalPosition: {
                X: (Element.x + Element.width / 2) / greatestAncestor.width,
                Y: (Element.y + Element.height / 2) / greatestAncestor.height
            },
            Size: {
                X: Element.width / greatestAncestor.width,
                Y: Element.height / greatestAncestor.height
            },
            Children: [],
            Parent: Parent,
            Element: Element,
        }

        if (PropertyTypes["exportSettings"](Element, Properties) === false) {
            for (const Property in Element) {
                if (Property in PropertyTypes) {
                    if (Property === "exportSettings") continue; // Already done
                    if (PropertyTypes[Property](Element, Properties) === false) return false;
                }
            }
        }

        return Properties;
    },
    ["FRAME"]: (Element, Parent) => {
        var Properties = {
            Class: "Frame",
            Type: Element.type,
            Name: Element.name,
            BackgroundTransparency: 0,
            BorderSizePixel: 0,
            GroupOpacity: Element.opacity,
            Visible: Element.visible,
            Position: {
                X: (Element.x + Element.width / 2) / Element.parent.width,
                Y: (Element.y + Element.height / 2) / Element.parent.height
            },
            Size: {
                X: Element.width / Element.parent.width,
                Y: Element.height / Element.parent.height
            },
            Rotation: -Element.rotation,
            Children: [],
            Parent: Parent,
            Element: Element,
        }

        if (!Element.parent.width || !Element.parent.height){
            Properties.Position.X = 0.5;
            Properties.Size.X = 1;
            Properties.Position.Y = 0.5;
            Properties.Size.Y = 1
        }
    
        if (PropertyTypes["exportSettings"](Element, Properties) === false) {
            for (const Property in Element) {
                if (Property in PropertyTypes) {
                    if (Property === "exportSettings") continue; // Already done
                    if (PropertyTypes[Property](Element, Properties) === false) return false;
                }
            }
        }
    
        return Properties;
    },
    ["INSTANCE"]: (Element, Parent) => {
        var Properties = {
            Class: "Frame",
            Type: Element.type,
            Name: Element.name,
            BackgroundTransparency: 0,
            BorderSizePixel: 0,
            GroupOpacity: Element.opacity,
            Visible: Element.visible,
            Position: {
                X: (Element.x + Element.width / 2) / Element.parent.width,
                Y: (Element.y + Element.height / 2) / Element.parent.height
            },
            Size: {
                X: Element.width / Element.parent.width,
                Y: Element.height / Element.parent.height
            },
            Rotation: -Element.rotation,
            Children: [],
            Parent: Parent,
            Element: Element,
        }

        if (!Element.parent.width || !Element.parent.height){
            Properties.Position.X = 0.5;
            Properties.Size.X = 1;
            Properties.Position.Y = 0.5;
            Properties.Size.Y = 1
        }
    
        if (PropertyTypes["exportSettings"](Element, Properties) === false) {
            for (const Property in Element) {
                if (Property in PropertyTypes) {
                    if (Property === "exportSettings") continue; // Already done
                    if (PropertyTypes[Property](Element, Properties) === false) return false;
                }
            }
        }
    
        return Properties;
    },
    ["RECTANGLE"]: (Element, Parent) => {
        var Properties = {
            Class: "Frame",
            Type: Element.type,
            Name: Element.name,
            BackgroundTransparency: Element.opacity,
            BorderSizePixel: 0,
            Visible: Element.visible,
            Position: {
                X: (Element.x + Element.width / 2) / Element.parent.width,
                Y: (Element.y + Element.height / 2) / Element.parent.height
            },
            Size: {
                X: Element.width / Element.parent.width,
                Y: Element.height / Element.parent.height
            },
            Rotation: -Element.rotation,
            Children: [],
            Parent: Parent,
            Element: Element,
        }
    
        if (PropertyTypes["exportSettings"](Element, Properties) === false) {
            for (const Property in Element) {
                if (Property in PropertyTypes) {
                    if (Property === "exportSettings") continue; // Already done
                    if (PropertyTypes[Property](Element, Properties) === false) return false;
                }
            }
        }
    
        return Properties;
    },
    ["ELLIPSE"]: (Element, Parent) => {
        var Properties = {
            Class: "Frame",
            Type: Element.type,
            Name: Element.name,
            BackgroundTransparency: Element.opacity,
            BorderSizePixel: 0,
            Visible: Element.visible,
            Position: {
                X: (Element.x + Element.width / 2) / Element.parent.width,
                Y: (Element.y + Element.height / 2) / Element.parent.height
            },
            Size: {
                X: Element.width / Element.parent.width,
                Y: Element.height / Element.parent.height
            },
            Rotation: Element.rotation,
            Children: [
                {
                    Class: "UICorner",
                    Type: "UICorner",
                    CornerRadius: {
                        S: 1,
                        O: 0,
                    }
                }
            ],
            Parent: Parent,
            Element: Element,
        }
    
        if (PropertyTypes["exportSettings"](Element, Properties) === false) {
            for (const Property in Element) {
                if (Property in PropertyTypes) {
                    if (Property === "exportSettings") continue; // Already done
                    if (PropertyTypes[Property](Element, Properties) === false) return false;
                }
            }
        }
    
        return Properties;
    },
    ["TEXT"]: (Element, Parent) => {
        var Properties = {
            Class: "TextLabel",
            Type: Element.type,
            Name: Element.name,
            BackgroundTransparency: 0,
            BorderSizePixel: 0,
            TextTransparency: Element.opacity,
            Visible: Element.visible,
            Position: {
                X: (Element.x + Element.width / 2) / Element.parent.width,
                Y: (Element.y + Element.height / 2) / Element.parent.height
            },
            Size: {
                X: Element.width / Element.parent.width,
                Y: Element.height / Element.parent.height
            },
            TextSize: Element.fontSize == figma.mixed ? 0 : Element.fontSize,
            TextXAlignment: Element.textAlignHorizontal,
            TextYAlignment: Element.textAlignVertical,
            Text: Element.characters,
            Rotation: Element.rotation,
            Children: [],
            Parent: Parent,
            Element: Element,
        }

        if (PropertyTypes["exportSettings"](Element, Properties) === false) {
            for (const Property in Element) {
                if (Property in PropertyTypes) {
                    if (Property === "exportSettings") continue; // Already done
                    if (PropertyTypes[Property](Element, Properties) === false) return false;
                }
            }
        }
    
        return Properties;
    },
    ["ImageButton"]: (Element, Parent) => {
        var Properties = {
            Class: "ImageButton",
            Type: Element.type,
            Name: Element.name,
            BackgroundTransparency: 0,
            ImageTransparency: Element.opacity,
            Visible: Element.visible,
            Position: {
                X: (Element.x + Element.width / 2) / Element.parent.width,
                Y: (Element.y + Element.height / 2) / Element.parent.height
            },
            Size: {
                X: Element.width / Element.parent.width,
                Y: Element.height / Element.parent.height
            },
            Rotation: Element.rotation,
            Children: [],
            Parent: Parent,
            Element: Element,
        };

        // Xử lý exportSettings để xuất hình ảnh (nếu có)
        if (PropertyTypes["exportSettings"](Element, Properties) === false) {
            for (const Property in Element) {
                if (Property in PropertyTypes) {
                    if (Property === "exportSettings") continue; // Đã xử lý
                    PropertyTypes[Property](Element, Properties);
                }
            }
        }

        // Nếu không có hình ảnh được xuất, xuất phần tử dưới dạng hình ảnh mặc định
        if (!Properties.UploadId) {
            ExportImage(Element, Properties);
        }

        return Properties;
    },
    ["OTHER"]: (Element, Parent) => {
        var Properties = {
            Class: "ImageLabel",
            Type: Element.type,
            Name: Element.name,
            BackgroundTransparency: 0,
            ImageTransparency: Element.opacity,
            Visible: Element.visible,
            Position: {
                X: (Element.x + Element.width / 2) / Element.parent.width,
                Y: (Element.y + Element.height / 2) / Element.parent.height
            },
            Size: {
                X: Element.width / Element.parent.width,
                Y: Element.height / Element.parent.height
            },
            Rotation: Element.rotation,
            Children: [],
            Parent: Parent,
            Element: Element,
        }

        if (Element["children"]) PropertyTypes["children"](Element, Properties);

        ExportImage(Element, Properties);
    
        return Properties;
    }
}

// ^^ Couldn't get this to work, so I just copied the code from Conversions.js
function CreateRobloxElement(Properties) {
    var XML = "";

    function ExtendXML(String) {
        XML += String;
    }

    function LimitDecimals(number, decimals) {
        return parseFloat(number.toFixed(decimals));
    }

    ExtendXML(`<Item class="${Properties.Class}" referent="RBX0">`);
    ExtendXML(`<Properties>`);

    // Add properties
    ExtendXML(`<string name="Name">${(Properties.Name || Properties.Class || "Unknown").replace("\n", "")}</string>`);

    if (Properties.BackgroundColor3 !== undefined) {
        var Colour = Properties.BackgroundColor3;
        for (const Property in Colour) {
            Colour[Property] = LimitDecimals(Colour[Property], 6);
        }
        ExtendXML(`<Color3 name="BackgroundColor3"><R>${Colour.R}</R><G>${Colour.G}</G><B>${Colour.B}</B></Color3>`);
    }

    if (Properties.TextColor3 !== undefined) {
        var Colour = Properties.TextColor3;
        for (const Property in Colour) {
            Colour[Property] = LimitDecimals(Colour[Property], 6);
        }
        ExtendXML(`<Color3 name="TextColor3"><R>${Colour.R}</R><G>${Colour.G}</G><B>${Colour.B}</B></Color3>`);
    }

    if (Properties.Colour !== undefined) {
        var Colour = Properties.Colour;
        if (Colour["R"] !== undefined) {
            for (const Property in Colour) {
                Colour[Property] = LimitDecimals(Colour[Property], 6);
            }
            ExtendXML(`<Color3 name="Color"><R>${Colour.R}</R><G>${Colour.G}</G><B>${Colour.B}</B></Color3>`);
        } else {
            var ColourSeq = "";
            var Previous;
            for (var i = 0; i < Colour.length; i++) {
                const ColourStop = Colour[i];
                var ColourVal = ColourStop.Colour;
                for (const Property in ColourVal) {
                    ColourVal[Property] = LimitDecimals(ColourVal[Property], 6);
                }
                if (i === 0 && ColourStop.TimePosition !== 0) ColourSeq += `0 ${ColourVal.R} ${ColourVal.G} ${ColourVal.B} 0 `; // Add the first keyframe (if it doesn't exist)
                Previous = ColourStop;
                ColourSeq += `${ColourStop.TimePosition} ${ColourVal.R} ${ColourVal.G} ${ColourVal.B} 0 `;
            }
            if (Previous.TimePosition !== 1) ColourSeq += `1 ${Previous.Colour.R} ${Previous.Colour.G} ${Previous.Colour.B} 0 `; // Add the last keyframe (if it doesn't exist)
            ExtendXML(`<ColorSequence name="Color">${ColourSeq}</ColorSequence>`);
        }
    }

    if (Properties.Transparency !== undefined) {
        const Transparency = Properties.Transparency;
        if (!Array.isArray(Transparency)) {
            ExtendXML(`<float name="Transparency">${1 - LimitDecimals(Properties.Transparency, 3)}</float>`);
        } else {
            var NumberSequence = "";
            var Previous;
            for (var i = 0; i < Transparency.length; i++) {
                var TransparencyStop = Transparency[i];
                if (i === 0 && TransparencyStop.TimePosition !== 0) NumberSequence += `0 ${LimitDecimals(TransparencyStop.Transparency, 3)} 0 `; // Add the first keyframe (if it doesn't exist)
                Previous = TransparencyStop;
                NumberSequence += `${TransparencyStop.TimePosition} ${LimitDecimals(TransparencyStop.Transparency, 3)} 0 `;
            }
            if (Previous.TimePosition !== 1) NumberSequence += `1 ${Previous.Transparency} 0 `; // Add the last keyframe (if it doesn't exist)
            ExtendXML(`<NumberSequence name="Transparency">${NumberSequence}</NumberSequence>`);
        }
    }

    if (Properties.Size !== undefined) {
        var Size = Properties.Size;
        ExtendXML(`<UDim2 name="Size"><XS>${LimitDecimals(Size.X, 5)}</XS><XO>0</XO><YS>${LimitDecimals(Size.Y, 5)}</YS><YO>0</YO></UDim2>`);
    }

    if (Properties.Rotation !== undefined && Properties.Rotation !== 0) {
        ExtendXML(`<float name="Rotation">${LimitDecimals(Properties.Rotation, 3)}</float>`);
    }

    if (Properties.Position !== undefined) {
        var Position = Properties.Position;
        ExtendXML(`<UDim2 name="Position"><XS>${LimitDecimals(Position.X, 5)}</XS><XO>0</XO><YS>${LimitDecimals(Position.Y, 5)}</YS><YO>0</YO></UDim2>`);
    }

    ExtendXML(`<Vector2 name="AnchorPoint"><X>0.5</X><Y>0.5></Y></Vector2>`);

    if (Properties.BackgroundTransparency !== undefined) {
        ExtendXML(`<float name="BackgroundTransparency">${1 - LimitDecimals(Properties.BackgroundTransparency, 3)}</float>`);
    }

    if (Properties.Thickness !== undefined) {
        ExtendXML(`<float name="Thickness">${LimitDecimals(Properties.Thickness, 0)}</float>`);
    }

    if (Properties.LineJoinMode !== undefined) {
        ExtendXML(`<Enum name="LineJoinMode">0</Enum>`);
    } else if (Properties.UIStroke !== undefined) {
        ExtendXML(`<Enum name="LineJoinMode">0</Enum>`);
    }

    if (Properties.CornerRadius !== undefined) {
        ExtendXML(`<UDim2 name="CornerRadius"><S>${LimitDecimals(Properties.CornerRadius.S, 0)}</S><O>${LimitDecimals(Properties.CornerRadius.O, 0)}</O></UDim2>`);
    }

    if (Properties.BorderSizePixel !== undefined) {
        ExtendXML(`<int name="BorderSizePixel">${LimitDecimals(Properties.BorderSizePixel, 0)}</int>`);
    }

    if (Properties.ClipsDescendants !== undefined) {
        ExtendXML(`<bool name="ClipsDescendants">${Properties.ClipsDescendants}</bool>`);
    }

    if (Properties.TextTransparency !== undefined) {
        ExtendXML(`<float name="TextTransparency">${1 - Properties.TextTransparency}</float>`);
    }

    if (Properties.TextSize !== undefined) {
        ExtendXML(`<int name="TextSize">${LimitDecimals(Properties.TextSize, 0)}</int>`);
    }

    if (Properties.Text !== undefined) {
        ExtendXML(`<string name="Text">${Properties.Text}</string>`);
    }

    if (Properties.TextWrapped !== undefined) {
        ExtendXML(`<bool name="TextWrapped">${Properties.TextWrapped}</bool>`);
    }

    // if (Properties.TextScaled !== undefined) {
        ExtendXML(`<bool name="TextScaled">${true}</bool>`);
    // }

    if (Properties.TextStrokeTransparency !== undefined) {
        ExtendXML(`<float name="TextStrokeTransparency">${1 - Properties.TextStrokeTransparency}</float>`);
    }

    if (Properties.TextStrokeColor3 !== undefined) {
        ExtendXML(`<Color3 name="TextStrokeColor3"><R>${LimitDecimals(Properties.TextStrokeColor3.R, 3)}</R><G>${LimitDecimals(Properties.TextStrokeColor3.G, 3)}</G><B>${LimitDecimals(Properties.TextStrokeColor3.B, 3)}</B></Color3>`);
    }

    if (Properties.TextXAlignment !== undefined) {
        ExtendXML(`<token name="TextXAlignment">${TextXAlignments.indexOf(Properties.TextXAlignment)}</token>`);
    }

    if (Properties.TextYAlignment !== undefined) {
        ExtendXML(`<token name="TextYAlignment">${TextYAlignments.indexOf(Properties.TextYAlignment)}</token>`);
    }

    // if (Properties.Font !== undefined) {
    //     const Font = Fonts[Properties.Font.Style] || Fonts["Regular"];
    //     ExtendXML(`<Font name="FontFace"><Family><url>rbxasset://fonts/families/${Properties.Font.Family}.json</url></Family><Weight>${Font.Weight}</Weight><Style>${Font.Style}</Style></Font>`);
    // }

    if (Properties.FontEnum !== undefined) {
    ExtendXML(`<Enum name="Font">${Properties.FontEnum}</Enum>`);
    }

    if (Properties.RichText !== undefined) {
        ExtendXML(`<bool name="RichText">${Properties.RichText}</bool>`);
    }

    if (Properties.UploadId !== undefined && ImageExports[Properties.UploadId] !== undefined) {
        ExtendXML(`<string name="Image"><url>${ImageExports[Properties.UploadId].ImageId}</url></string>`);
    } else if (Properties.Image !== undefined) {
        ExtendXML(`<string name="Image">${Properties.Image}</string>`);
    }

    if (Properties.ImageTransparency !== undefined) {
        ExtendXML(`<float name="ImageTransparency">${1 - LimitDecimals(Properties.ImageTransparency, 3)}</float>`);
    }

    if (Properties.Class === "ImageLabel") {
        if (Properties.ScaleType !== undefined) {
            ExtendXML(`<Enum name="ScaleType">${Properties.ScaleType}</Enum>`);
        } else {
            ExtendXML(`<Enum name="ScaleType">4</Enum>`);
        }
    }

    if (Properties.Visible !== undefined) {
        ExtendXML(`<bool name="Visible">${Properties.Visible}</bool>`);
    }

    if (Properties.Enabled !== undefined) {
        ExtendXML(`<bool name="Enabled">${Properties.Enabled}</bool>`);
    }

    // End of properties
    ExtendXML("</Properties>");

    // Add children
    if (Properties.Children !== undefined && Properties.Children.length > 0 && Properties.NoChildren === undefined) {
        for (var i = 0; i < Properties.Children.length; i++) {
            ExtendXML(CreateRobloxElement(Properties.Children[i], i));
        }
    }

    return XML + "</Item>";
}

function getGreatestAncestor(node) {
  let currentNode = node;
  // Kiểm tra nếu node hiện tại có parent và parent không phải PageNode
  while (currentNode.parent && currentNode.parent.type !== "PAGE") {
    currentNode = currentNode.parent;
  }
  return currentNode;
}

function ConvertToRoblox(Objects) { // Converts the code into roblox xml format
    var XML = '<!--\n\tGenerated by Figma to Roblox\n\tReport any bugs/issues to NoTwistedHere#6703\n-->\n\n<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4"><Meta name="ExplicitAutoJoints">true</Meta>';

    for (var i = 0; i < Objects.length; i++) {
        XML += CreateRobloxElement(Objects[i]);
    }
    
    return XML + '</roblox>';
}

function GetMainProperties(Object, Parent) {
    // console.log(greatestAncestor);
    if (Object.name.match(/BTN/)) {
        return ElementTypes["ImageButton"](Object, Parent);
    }
    if (ElementTypes[Object.type] !== undefined) {
        return ElementTypes[Object.type](Object, Parent);
    } else {
    return ElementTypes["OTHER"](Object, Parent);
    }
}

async function RunPlugin() {
    // Get selected elements
    var SelectedElements = figma.currentPage.selection;

    if (SelectedElements.length == 0) {
        return QuickClose("No elements selected");
    }

    // Get main properties
    Notify("Converting...");
    console.log("Converting...");

    var Objects = [];
    const totalElements = SelectedElements.length;
    greatestAncestor = getGreatestAncestor(SelectedElements[0]);
    console.log(greatestAncestor.name, greatestAncestor.type, greatestAncestor.width, greatestAncestor.height);
    // Gửi tiến độ cho giai đoạn chuyển đổi
    for (var i = 0; i < totalElements; i++) {
        Objects.push(GetMainProperties(SelectedElements[i]));
        // Cập nhật tiến độ (tính bằng phần trăm)
        const conversionProgress = ((i + 1) / totalElements) * 50; // 50% cho chuyển đổi
        figma.ui.postMessage({
            type: "ConversionProgress",
            data: { progress: conversionProgress }
        });
        // Thêm độ trễ nhỏ để UI cập nhật mượt mà hơn
        await new Promise(resolve => setTimeout(resolve, 10));
    }

    Notify("Uploading Images...");

    // Gửi tiến độ cho giai đoạn tải lên hình ảnh
    const totalImages = QueuedImages;
    while (QueuedImages > 0) {
        const uploadProgress = 50 + ((totalImages - QueuedImages) / totalImages) * 50; // 50% còn lại cho tải lên
        figma.ui.postMessage({
            type: "ConversionProgress",
            data: { progress: uploadProgress }
        });
        await new Promise(resolve => setTimeout(resolve, 250));
    }

    Notify("Formatting...");

    var XML = ConvertToRoblox(Objects);

    Objects = null;

    if (XML === false) {
        return;
    }

    figma.ui.postMessage({
        type: "Download",
        data: XML
    });
    XML = null;

    // Hoàn tất tiến độ
    figma.ui.postMessage({
        type: "ConversionProgress",
        data: { progress: 100 }
    });

    Notify("Successfully converted!");
}

figma.showUI(__html__, { width: 400, height: 550 });

figma.ui.onmessage = msg => {
    switch (msg.type) {
        case "exec":
            try {
                RunPlugin();
            } catch (e) {
                if (!HandledError) {
                    throw e;
                }
            
                console.warn(e);
            }
            break;
        case "close-plugin":
            figma.closePlugin();
            break;
        case "SetAsync": 
            figma.clientStorage.setAsync(msg.key, msg.value);
            break;
        case "FetchAsync":
            figma.clientStorage.keysAsync().then(keys => {
                for (var i = 0; i < keys.length; i++) {
                    const Key = keys[i];
                    figma.clientStorage.getAsync(Key).then(value => {
                        figma.ui.postMessage({
                            type: "GetAsync",
                            data: {
                                key: Key,
                                value: value
                            }
                        });
                    });
                }
            });
            break;
        case "image-upload-success":
            ImageExports[msg.data.UploadId].ImageId = "rbxassetid://" + msg.data.response.assetId;
            QueuedImages--;
            break;
        case "image-upload-fail":
            QueuedImages--;
            console.warn(`Failed to upload image`);
            break;
    }
}