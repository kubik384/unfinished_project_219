"use strict"

import { Utils } from '../misc_modules/utils.js';
import { Base_Page } from './base_page.js';
var utils = new Utils();

class Game extends Base_Page {
    constructor(socket) {
        super();
        this.socket = socket;
        this.res_map_canvas;
        this.map_width;
        this.map_height;
        this.ctx;
        this.logic_loop;
        this.tick_time = 100;
        this.zoom = 0.25;
        this.x_spacing = 800;
        this.y_spacing = 300;
        this.tech_img_width = 100;
        this.tech_img_height = 100;
        
        this.xOffset = 0;
        this.yOffset = 0;
        this.dragging = false;
        this.image = document.getElementById('rocket_preview');
    }

    async request_data() {
        this.socket.emit('research_datapack_request', this.layout);
    }

    async setup_game(p_datapack) {
        var datapack = JSON.parse(p_datapack);
        console.log(datapack);
        super.setup_page(datapack);
        this.technologies = datapack.technologies;
        for (var i = 0; i < this.technologies.length; i++) {
            this.technologies[i].x1 = this.x_spacing * this.technologies[i].col;
            this.technologies[i].x2 = this.technologies[i].x1 + this.tech_img_width;
            this.technologies[i].y1 = this.y_spacing * this.technologies[i].row;
            this.technologies[i].y2 = this.technologies[i].y1 + this.tech_img_height;
        }
        this.res_map_canvas = document.getElementById("research_map");
        this.ctx = this.res_map_canvas.getContext("2d");
        this.res_map_rect = this.res_map_canvas.getBoundingClientRect();
        window.onresize = this.window_resize_handler();
        //expecting the border to have the same width on all the sides of the canvas
        //this.res_map_canvas_border = +getComputedStyle(this.res_map_canvas).getPropertyValue('border-top-width').slice(0, -2);

        document.getElementById('research_map').addEventListener('wheel', e => {
            e.preventDefault();
            if (this.hovered_technology_index !== undefined) {
                this.res_map_canvas.style.cursor = "default";
            }
            var x = e.clientX - this.res_map_rect.left;//- this.res_map_canvas_border;
            var y = e.clientY - this.res_map_rect.top;//- this.res_map_canvas_border;
            if (e.deltaY < 0) {
                if (this.zoom < 12) {
                    const deltaZoom = 1.25;
                    var oldZoom = this.zoom;
                    this.zoom *= deltaZoom;
                    var zoomRatio = (this.zoom - oldZoom)/oldZoom;
                    this.xOffset += (this.xOffset - x) * zoomRatio;
                    this.yOffset += (this.yOffset - y) * zoomRatio;
                }
            } else {
                if (this.zoom > 0.05) {
                    const deltaZoom = 0.8;
                    var oldZoom = this.zoom;
                    this.zoom *= deltaZoom;
                    var zoomRatio = (oldZoom - this.zoom)/oldZoom;
                    this.xOffset -= (this.xOffset - x) * zoomRatio;
                    this.yOffset -= (this.yOffset - y) * zoomRatio;
                }
            }
        });

        document.getElementById('research_map').addEventListener('mousedown', e => {
            //left click
            if (e.button == 0) {
                this.dragging = true;
                if (this.hovered_technology_index !== undefined) {
                    this.mousedown_tech_index = this.hovered_technology_index;
                }
            }
        });

        window.addEventListener('mouseup', e => {
            //left click
            if (e.button == 0) {
                this.dragging = false;
                if (this.mousedown_tech_index !== undefined) {
                    var cursor = {};
                    cursor.x = (e.clientX - this.xOffset - this.res_map_rect.left/*- this.res_map_canvas_border*/)/this.zoom;
                    cursor.y = (e.clientY - this.yOffset - this.res_map_rect.top/*- this.res_map_canvas_border*/)/this.zoom;
                    if (utils.isInsideObject(cursor, this.technologies[this.mousedown_tech_index], this.calc_padding(5))) {
                        this.display_tech_description(this.technologies[this.mousedown_tech_index]);
                    }
                }
            }
        });

        document.addEventListener('mousemove', e => {
            if (this.dragging) {
                this.xOffset += e.movementX;
                this.yOffset += e.movementY;
            }

            var hovering_tech = this.hovered_technology_index !== undefined;
            this.hovered_technology_index = undefined;
            var cursor = {};
            cursor.x = (e.clientX - this.xOffset - this.res_map_rect.left/*- this.res_map_canvas_border*/)/this.zoom;
            cursor.y = (e.clientY - this.yOffset - this.res_map_rect.top/*- this.res_map_canvas_border*/)/this.zoom;
            for (var i = 0; i < this.technologies.length; i++) {
                if (utils.isInsideObject(cursor, this.technologies[i], this.calc_padding(5))) {
                    this.hovered_technology_index = i;
                    break;
                }
            }
            if (this.hovered_technology_index !== undefined) {
                if (this.res_map_canvas.style.cursor != "pointer") {
                    this.res_map_canvas.style.cursor = "pointer";
                }
            } else if (hovering_tech) {
                this.res_map_canvas.style.cursor = "default";
            }
        });

        window.addEventListener("visibilitychange", () => {
            if (document.visibilityState == 'hidden') {
                this.dragging = false;
            }
        });

        document.getElementById('close_button').addEventListener('click', function() {
            document.getElementById('research_info_panel').style.display = "none";
        });

        document.getElementById('research_button').addEventListener('click', function() {
            
        });
        
        window.requestAnimationFrame(this.draw.bind(this));
        this.logic_loop = setTimeout(this.update.bind(this), this.tick_time);
        return;
    }

    update() {

    }
    
    draw() {
        this.ctx.clearRect(0, 0, this.res_map_width, this.res_map_height);
        this.ctx.save();
        this.ctx.translate(this.xOffset, this.yOffset);
        for (var i = 0; i < this.technologies.length; i++) {
            this.ctx.drawImage(this.image, this.technologies[i].x1 * this.zoom, this.technologies[i].y1 * this.zoom, this.tech_img_width * this.zoom, this.tech_img_height * this.zoom);
            if (this.technologies[i].req_tech_ids.length > 0) {
                for (var j = 0; j < this.technologies[i].req_tech_ids.length; j++) {
                    var req_tech = this.technologies.find(technology => technology.technology_id = this.technologies[i].req_tech_ids[j]);
                    if (this.technologies[i].col > req_tech.col) {
                        if (this.technologies[i].row == req_tech.row) {
                            var y = (req_tech.y2 - this.tech_img_height/2) * this.zoom;
                            this.ctx.beginPath();
                            this.ctx.moveTo(Math.floor(req_tech.x2 * this.zoom), y);
                            this.ctx.lineTo(Math.floor(this.technologies[i].x1 * this.zoom), y);
                            this.ctx.stroke();
                        } else {
                            this.ctx.beginPath();
                            var x1 = Math.floor(req_tech.x2 * this.zoom);
                            var x2 = Math.floor(this.technologies[i].x1 * this.zoom);
                            var y1 = (req_tech.y2 - this.tech_img_height/2) * this.zoom;
                            var y2 = (this.technologies[i].y2 - this.tech_img_height/2) * this.zoom;
                            var x_diff = x1 - x2;
                            this.ctx.moveTo(x1, y1);
                            this.ctx.lineTo(x1 - Math.floor(x_diff/2), y1);
                            this.ctx.lineTo(x1 - Math.floor(x_diff/2), y2);
                            this.ctx.lineTo(x2, y2);
                            this.ctx.stroke();
                        }
                    } else {
                        //todo (if it's ever neccessary)
                    }
                }
            }
        }
        this.ctx.restore();
        window.requestAnimationFrame(this.draw.bind(this));
    }

    window_resize_handler() {
        //var dpi = window.devicePixelRatio;
        var res_map_height = +getComputedStyle(this.res_map_canvas).getPropertyValue("height").slice(0, -2);
        var res_map_width = +getComputedStyle(this.res_map_canvas).getPropertyValue("width").slice(0, -2);
        this.res_map_height = res_map_height; //* dpi;
        this.res_map_width = res_map_width; //* dpi;
        this.xOffset = 50;
        this.yOffset = res_map_height/2;
        this.res_map_canvas.setAttribute('height', this.res_map_height);
        this.res_map_canvas.setAttribute('width', this.res_map_width);
        return this.window_resize_handler.bind(this);
    }

    calc_padding(px) {
        return px / (this.zoom > 1 ? this.zoom : 1);
    }

    display_tech_description(tech) {
        var panel = document.getElementById('research_info_panel');
        panel.style.removeProperty("display");
        document.getElementById('research_image').setAttribute("src", "/client_side/images/research/" + tech.name + ".png");
        document.getElementById('research_description').textContent = tech.description;
    }
}

export { Game };