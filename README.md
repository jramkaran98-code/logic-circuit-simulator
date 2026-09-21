# Logic Circuit Simulator

An interactive browser-based logic circuit simulator built with HTML, CSS, and JavaScript. The application allows users to build digital logic circuits by placing gates on a workspace, connecting them with wires, and evaluating their outputs.

> **Note:** This application is designed for desktop use and is not currently optimized for mobile devices.

## Features

* Drag-and-drop circuit components onto the workspace
* Supports:

  * INPUT
  * OUTPUT
  * AND
  * NAND
  * OR
  * NOR
  * XOR
  * XNOR
  * NOT
* Connect gates by clicking output and input pins
* Move gates around the workspace
* Snap components to a configurable grid
* Curved SVG wires between connected components
* Toggle input values between 0 and 1
* Run circuits and evaluate gate outputs
* Optional live circuit evaluation
* Generate a truth table from circuit inputs and outputs
* Save and load circuits using browser local storage
* Undo and redo actions
* Select and delete gates and wires

## Technologies Used

* **HTML5** - application structure
* **CSS3** - interface styling and layout
* **JavaScript** - circuit logic, user interaction, and state management
* **SVG** - gates, connection pins, grid, and circuit wires
* **LocalStorage API** - saving and loading circuits

## How It Works

The application represents each gate as a node and each connection as a wire between nodes.

When a circuit is evaluated, the program:

1. Identifies the connections between gates.
2. Retrieves the current values of the input gates.
3. Passes those values through the connected logic gates.
4. Calculates each gate's output using JavaScript logic and bitwise operations.
5. Repeats the evaluation until the circuit reaches a stable state.
6. Updates the displayed gate outputs and truth table.

## How to Run

### Requirements

* A desktop web browser such as Google Chrome, Microsoft Edge, or Firefox.

### Run the Application

1. Download or clone this repository.
2. Open the project folder.
3. Open `index.html` in a desktop web browser.
4. The Logic Circuit Simulator will open in the browser.

No additional installation or server is required.

## Project Structure

```text
logic-circuit-simulator/
├── index.html
├── style.css
├── script.js
└── README.md
```

## What I Learned

This project provided practical experience with:

* JavaScript event handling
* DOM manipulation
* SVG graphics and dynamic element creation
* Drag-and-drop interactions
* Graph-based circuit representation
* Digital logic operations
* State management
* Undo/redo functionality
* Browser local storage
* Dynamic user interfaces
* Circuit evaluation and output propagation

## Future Improvements

Potential future improvements include:

* Responsive/mobile support
* Additional circuit components
* More advanced truth table generation
* Circuit validation and error detection
* Exporting and importing circuit files
* Improved visual representation of signal states

## Author

Jeziel Ramkaran
BSc Electrical & Computer Engineering
