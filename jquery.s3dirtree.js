"use strict";

(function ($) {
	var elementInViewport = function(el) {
		var top = el.offsetTop - el.scrollTop;
		var left = el.offsetLeft - el.scrollLeft;
		var width = el.offsetWidth;
		var height = el.offsetHeight;

		while(el.offsetParent && $(el).css('position')!=='fixed') {
			el = el.offsetParent;
			top += el.offsetTop - el.scrollTop;
			left += el.offsetLeft - el.scrollLeft;
		}

		return (top < (window.pageYOffset + window.innerHeight) &&
			left < (window.pageXOffset + window.innerWidth) &&
			(top + height) > window.pageYOffset &&
			(left + width) > window.pageXOffset);
	};
	
	var endsWith = function(str, suffix) {
		return str.indexOf(suffix, str.length - suffix.length) !== -1;
	};
	
	var isExtensionMatch = function(str, fileExtensions) {
		for (var i=0; i<fileExtensions.length; i++) {
			if (endsWith(str.toLowerCase(), fileExtensions[i])) {
				return true;
			}
		}
		return false;
	};
	
	var getHighlightEl = function($el) {
		return $el.find('.highlight');
	};
	
	var getSettings = function($el) {
		return $el.data('settings');
	};
	
	var getSelectedItem = function($container) {
		return $container.find('.thumbnail[data-selected="true"]');
	};
	
	var getHighlightLocation = function($container, $item) {
		var $highlight = getHighlightEl($container);
	
		var left = $item[0].offsetLeft - ($highlight.outerWidth() - $item.outerWidth()) / 2;
		var top = $item[0].offsetTop - ($highlight.outerHeight() - $item.outerHeight()) / 2;
		return {
			left: left,
			top: top
		};
	};
	
	var selectItem = function($container, $item) {
		var $highlight = getHighlightEl($container),
			settings = getSettings($container);
		$highlight.remove()
			.appendTo($item.parent())
			.show()
			.css("width", $item.innerWidth())
			.css("height", $item.innerHeight());
			
		$highlight.animate(getHighlightLocation($container, $item),	500);
		settings.itemSelected($item);
		
		$container.find('.thumbnail').attr('data-selected','false');
		$item.attr('data-selected', 'true');
	};


	var methods = {
		init: function(options) {
			var settings = options;			
			var $el = $(this);
			var $highlight;
			var uploadQueue = djiaak.AsyncQueue();
			var items=[];

			var loadItemsFromPath(path, result) {
				if (!items[path]) {
					settings.dirLoadFunction(path, function(filesDirs) {
						items[path] = filesDirs;
						result(filesDirs);
					});
				} else {
					result(items[path]);
				}
			};

			var setElementThumbnail = function($el, thumbnailSrc, url) {
				$el.data('thumbnailSrc', thumbnailSrc || 'none');
				if (url) {
					$el.css('background-image', "url('" + url + "')")
						.css('background-size','contain');
				} else {
					$el.hide();
				}
			};
			
			var getThumbnailImageForPath = function(thumbnailPath) {
				return null;
			};
			
			var findThumbnail = function(files) {
				for (var i=0; i<files.length; i++) {
					if (settings.isThumbnailFunction(files[i])) {
						return files[i];
					}
				}
				return null;
			};
			
			var findImage = function(files) {
				for (var i=0; i<files.length; i++) {
					var f = files[i];
					if (isExtensionMatch(f, settings.fileExtensions)) {
						return f;
					}
				}
				return null;
			};
			
			var isThumbnailCached = function(thumbnailSrc) {
				for(var key in items) {
					if (items.hasOwnProperty(key)) {
						if ($.inArray(thumbnailSrc, items)!==-1) {
							return true;
						}
					}
				}
				return false;
			};
			
			var thumbnailScroll = function() {
				uploadQueue.stop();
				uploadQueue.clear();
				$el.find('.thumbnail').each(function() {
					if (elementInViewport(this)) {
						var thumbnailSrc = $(this).data('thumbnailSrc');
						if (!thumbnailSrc) {
							var src = $(this).data('src');
							var imageUrl = $(this).data('url');
							var thumbnailSrcToGenerate = settings.imageToThumbnailFunction(src);
							if (!isThumbnailCached(thumbnailSrcToGenerate)) {
								var func = (function($element, imageUrl, thumbnailSrcToGenerate) { return function() {
									settings.generateThumbnailFunc(imageUrl, function(result) {
										setElementThumbnail($element, thumbnailSrcToGenerate, result.dataUri);
										settings.fileUploadFunc(result.blob, thumbnailSrcToGenerate, function() {
											//success
											uploadQueue.funcCompleted();
										}, function() {
											//failure
											uploadQueue.funcCompleted();
										});
									});		
								}})($(this), imageUrl, thumbnailSrcToGenerate);
								uploadQueue.add(func);
							
							} else {
								setElementThumbnail($(this), thumbnailSrcToGenerate, '/' + thumbnailSrcToGenerate);
							}
						}
					}
				});
				
				$el.find('.preview').each(function() {
					if (elementInViewport(this)) { //check if element in viewport
						var thumbnailSrc = $(this).data('thumbnailSrc'); 
						if (!thumbnailSrc) { //check if preview already loaded
							var src = $(this).data('src'); //get image path
							var thumbnailPath = settings.dirToThumbnailFunction(src); //thumbnail path
							
							var func = (function($element, thumbnailPath, imagePath) { return function() {
								
								var thumbnailLoadResult = function(thumbFilesDirs) {
									var foundThumbnailSrc = findThumbnail(thumbFilesDirs.files);
									if (foundThumbnailSrc) {
										//thumbnail exists; display it
										setElementThumbnail($element, foundThumbnailSrc, '/' + foundThumbnailSrc);
										uploadQueue.funcCompleted();
									} else {
										//thumbnail doesn't exist; generate it
										loadItemsFromPath(imagePath, function(imageFilesDirs) { //first load all images for path
											var foundImageSrc = findImage(imageFilesDirs.files); //find (random) image
											if (foundImageSrc) { //image found
												var thumbnailSrcToGenerate = settings.imageToThumbnailFunction(foundImageSrc);
												settings.generateThumbnailFunc('/' + foundImageSrc, function(result) { //generate thumbnail for found image
													setElementThumbnail($element, thumbnailSrcToGenerate, result.dataUri); //set image src to thumbnail data uri
													settings.fileUploadFunc(result.blob, thumbnailSrcToGenerate, function() { //try to upload thumbnail image
														//success
														uploadQueue.funcCompleted();
													}, function() {
														//failure
														uploadQueue.funcCompleted();
													});
												});
											} else { //no image found; nothing to do (path doesn't contain images)
												setElementThumbnail($element, null, null);
												uploadQueue.funcCompleted();
											}
										});
									}	
								};
							
								if (thumbnailPath) {
									loadItemsFromPath(thumbnailPath, thumbnailLoadResult); //get directory listing of thumbnail path
								} else {
									thumbnailLoadResult({ files: [], dirs: [] }); //valid thumbnail path not found
								}
								
							}})($(this), thumbnailPath, src);
							
							uploadQueue.add(func);						
						}
					}
				});
				
				uploadQueue.start();
			};
			
			var bindThumbnailEvents = function() {
				$el.find('.thumbnail').click(function() {
					selectItem($el, $(this));
				});
			};
			
			var generateNode = function(name, file) {
				var $c = $('<div>').addClass('node-container')
					.append($('<span>').html(name))
					.append(
						$('<div>').addClass('preview')
							.attr('data-src', file)
					);
				return $('<div>').append($c).html();
			};
			
			var generateThumbnails = function(files) {
				var $c = $('<div>').addClass('thumbnail-container'),
					hasItems = false;
				for (var i=0; i<files.length; i++) {
					var f = files[i];
					if (isExtensionMatch(f, settings.fileExtensions)) {
						hasItems = true;
						$c.append($('<div>')
							.addClass('thumbnail')
							.css('width', settings.thumbnailWidth)
							.css('height', settings.thumbnailHeight)
							.attr('title', djiaak.FileUtils.getFilename(f))
							.attr('data-src', f)
							.attr('data-url', '/' + f)
						);
					}
				}
				if (hasItems) { return $('<div>').append($c).html(); }
				return null;
			};

			var loadData = function(node, basePath, callback) {
				var url, isRootNode = node===-1;
				if (isRootNode) { 
					url = basePath;
				} else {
					url = node.data('url');
				}

				var thumbnailDir = settings.dirToThumbnailFunction(url);
				if (thumbnailDir) {
					loadItemsFromPath(thumbnailDir, function(filesDirs) {
						thumbnailScroll();
					});
				}
				
				loadItemsFromPath(url, function(filesDirs) {
					var nodes =	$.map(filesDirs.dirs, function(val) {
						if (settings.isThumbnailFunction(val)) { return null; }
						
						return { data: generateNode(djiaak.FileUtils.getFilename(val.substr(0,val.length-1)), val), 
							metadata: { url: val },
							state: 'closed'
						};
					});
					
					var thumbnailHtml = generateThumbnails(filesDirs.files);
					if (thumbnailHtml) {
						nodes.push({
							data: {
								title: thumbnailHtml,
								icon: 'no-icon',
								attr: { 'class': 'thumbnails' }
							}
						});
					}
					if (isRootNode) {
						nodes = {
							data: settings.basePath,
							children: nodes,
							state: 'open'
						};
					}
					callback(nodes);
					bindThumbnailEvents();
					
					if (!$highlight) {
						$highlight = $('<div>').addClass('highlight').css('display','none').appendTo($el);
					}
					
					thumbnailScroll();
					
				});
			};
		
			//-------	
			$el.jstree({
				"core" : {
					"html_titles": true
				},
				"json_data": {
					"data" : function(node,callback) { 
						loadData(node, settings.basePath, callback); 
					}
				},
				"themes" : {
					"theme" : "default",
					"dots" : false,
					"icons" : true
				  },
				"plugins": [ "themes", "json_data" ]
			});
			
			var scrollTimer;
			var scrollFunc = function() {
				var $selectedItem = getSelectedItem($el);
				if ($highlight && $highlight.length && $selectedItem && $selectedItem.length) {
					$highlight.css(getHighlightLocation($el, $selectedItem,	500));
				}
				if (scrollTimer) {
					clearTimeout(scrollTimer);
				}
				scrollTimer = setTimeout(function() {
					thumbnailScroll();
				}, 500); 
			}
			
			$el.scroll(scrollFunc).resize(scrollFunc);
			
			
			
			$(this).data('settings', settings);
			return this;
		},
		
		nextImage: function() {
			var $el = getSelectedItem($(this)).next('.thumbnail');
			if ($el.length) {
				selectItem($(this), $el);
				return true;
			}
			return false;
		},
		
		prevImage: function() {
			var $el = getSelectedItem($(this)).prev('.thumbnail');
			if ($el.length) {
				selectItem($(this), $el);
				return true;
			}
			return false;
		}
	};
	
	
	$.fn.s3dirtree = function (method) {
		// Method calling logic
		if ( methods[method] ) {
		  return methods[ method ].apply( this, Array.prototype.slice.call( arguments, 1 ));
		} else if ( typeof method === 'object' || ! method ) {
		  return methods.init.apply( this, arguments );
		} else {
		  $.error( 'Method ' +  method + ' does not exist on jquery.s3dirtree' );
		}
	};
	
})(jQuery);
